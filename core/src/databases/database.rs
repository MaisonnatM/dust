use super::table_schema::TableSchema;
use crate::{
    databases_store::store::DatabasesStore,
    project::Project,
    sqlite_workers::client::{SqliteWorker, HEARTBEAT_INTERVAL_MS},
    stores::store::Store,
    utils,
};
use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    LOCAL,
    REMOTE,
}

impl ToString for DatabaseType {
    fn to_string(&self) -> String {
        match self {
            DatabaseType::LOCAL => String::from("local"),
            DatabaseType::REMOTE => String::from("remote"),
        }
    }
}

pub async fn query_database(
    tables: &Vec<Table>,
    store: Box<dyn Store + Sync + Send>,
    query: &str,
) -> Result<(Vec<QueryResult>, TableSchema)> {
    let table_ids_hash = tables.iter().map(|t| t.unique_id()).sorted().join("/");
    let database = store
        .upsert_database(&table_ids_hash, HEARTBEAT_INTERVAL_MS)
        .await?;

    let time_query_start = utils::now();

    let result_rows = match database.sqlite_worker() {
        Some(sqlite_worker) => {
            let result_rows = sqlite_worker
                .execute_query(&table_ids_hash, tables, query)
                .await?;
            result_rows
        }
        None => Err(anyhow!(
            "No live SQLite worker found for database {}",
            database.table_ids_hash
        ))?,
    };

    utils::done(&format!(
        "DSSTRUCTSTAT Finished executing user query on worker: duration={}ms",
        utils::now() - time_query_start
    ));

    let infer_result_schema_start = utils::now();
    let table_schema = TableSchema::from_rows(&result_rows)?;
    utils::done(&format!(
        "DSSTRUCTSTAT Finished inferring schema: duration={}ms",
        utils::now() - infer_result_schema_start
    ));

    utils::done(&format!(
        "DSSTRUCTSTAT Finished query database: duration={}ms",
        utils::now() - time_query_start
    ));

    Ok((result_rows, table_schema))
}

pub async fn invalidate_database(db: Database, store: Box<dyn Store + Sync + Send>) -> Result<()> {
    if let Some(worker) = db.sqlite_worker() {
        worker.invalidate_database(db.unique_id()).await?;
    } else {
        // If the worker is not alive, we delete the database row in case the worker becomes alive again.
        store.delete_database(&db.table_ids_hash).await?;
    }

    Ok(())
}

#[derive(Debug, Serialize, Clone)]
pub struct Database {
    created: u64,
    table_ids_hash: String,
    sqlite_worker: Option<SqliteWorker>,
}

impl Database {
    pub fn new(created: u64, table_ids_hash: &str, sqlite_worker: &Option<SqliteWorker>) -> Self {
        Database {
            created,
            table_ids_hash: table_ids_hash.to_string(),
            sqlite_worker: sqlite_worker.clone(),
        }
    }

    pub fn sqlite_worker(&self) -> &Option<SqliteWorker> {
        &self.sqlite_worker
    }

    pub fn unique_id(&self) -> &str {
        &self.table_ids_hash
    }
}

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct Table {
    project: Project,
    data_source_id: String,
    created: u64,

    table_id: String,
    name: String,
    description: String,
    schema: Option<TableSchema>,
}

pub fn get_table_unique_id(project: &Project, data_source_id: &str, table_id: &str) -> String {
    format!("{}__{}__{}", project.project_id(), data_source_id, table_id)
}

impl Table {
    pub fn new(
        project: &Project,
        data_source_id: &str,
        created: u64,
        table_id: &str,
        name: &str,
        description: &str,
        schema: &Option<TableSchema>,
    ) -> Self {
        Table {
            project: project.clone(),
            data_source_id: data_source_id.to_string(),
            created,
            table_id: table_id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            schema: schema.clone(),
        }
    }

    pub fn project(&self) -> &Project {
        &self.project
    }
    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }
    pub fn created(&self) -> u64 {
        self.created
    }
    pub fn table_id(&self) -> &str {
        &self.table_id
    }
    pub fn name(&self) -> &str {
        &self.name
    }
    pub fn description(&self) -> &str {
        &self.description
    }
    pub fn schema(&self) -> Option<&TableSchema> {
        self.schema.as_ref()
    }
    pub fn unique_id(&self) -> String {
        get_table_unique_id(&self.project, &self.data_source_id, &self.table_id)
    }

    pub fn render_dbml(&self) -> String {
        match self.schema {
            None => format!("Table {} {{\n}}", self.name()),
            Some(ref schema) => format!(
                "Table {} {{\n{}\n\n  Note: '{}'\n}}",
                self.name(),
                schema
                    .columns()
                    .iter()
                    .map(|c| format!("  {}", c.render_dbml()))
                    .join("\n"),
                self.description()
            ),
        }
    }

    pub async fn delete(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<()> {
        // Invalidate the databases that use the table.
        try_join_all(
            (store
                .find_databases_using_table(
                    &self.project,
                    &self.data_source_id,
                    &self.table_id,
                    HEARTBEAT_INTERVAL_MS,
                )
                .await?)
                .into_iter()
                .map(|db| invalidate_database(db, store.clone())),
        )
        .await?;

        // Delete the table rows.
        databases_store.delete_table_rows(&self.unique_id()).await?;

        store
            .delete_table(&self.project, &self.data_source_id, &self.table_id)
            .await?;

        Ok(())
    }

    pub async fn upsert_rows(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        rows: &Vec<Row>,
        truncate: bool,
    ) -> Result<()> {
        // Validate the tables schema, merge it if necessary and store it in the schema cache.
        let table_schema = match self.schema() {
            // If there is no existing schema cache, simply use the new schema.
            None => TableSchema::from_rows(&rows)?,
            Some(existing_table_schema) => {
                // If there is an existing schema cache, merge it with the new schema.
                existing_table_schema.merge(&TableSchema::from_rows(&rows)?)?
            }
        };
        store
            .update_table_schema(
                &self.project,
                &self.data_source_id,
                &self.table_id,
                &table_schema,
            )
            .await?;

        // Upsert the rows in the table.
        // Note: if this fails, the Table will still contain the new schema, but the rows will not be updated.
        // This isn't too bad, because the merged schema is necessarily backward-compatible with the previous one.
        // The other way around would not be true -- old schema doesn't necessarily work with the new rows.
        // This is why we cannot `try_join_all`.
        databases_store
            .batch_upsert_table_rows(&self.unique_id(), rows, truncate)
            .await?;

        // Invalidate the databases that use the table.
        try_join_all(
            (store
                .find_databases_using_table(
                    &self.project,
                    &self.data_source_id,
                    &self.table_id,
                    HEARTBEAT_INTERVAL_MS,
                )
                .await?)
                .into_iter()
                .map(|db| invalidate_database(db, store.clone())),
        )
        .await?;

        Ok(())
    }

    pub async fn retrieve_row(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        row_id: &str,
    ) -> Result<Option<Row>> {
        databases_store
            .load_table_row(&self.unique_id(), row_id)
            .await
    }

    pub async fn list_rows(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)> {
        databases_store
            .list_table_rows(&self.unique_id(), limit_offset)
            .await
    }
}

pub trait HasValue {
    fn value(&self) -> &Value;
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Row {
    row_id: String,
    value: Value,
}

impl Row {
    pub fn new(row_id: String, value: Value) -> Self {
        Row { row_id, value }
    }

    pub fn row_id(&self) -> &str {
        &self.row_id
    }
    pub fn content(&self) -> &Value {
        &self.value
    }
}

impl HasValue for Row {
    fn value(&self) -> &Value {
        &self.value
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct QueryResult {
    pub value: Value,
}

impl HasValue for QueryResult {
    fn value(&self) -> &Value {
        &self.value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils;
    use serde_json::json;

    #[test]
    fn test_database_table_to_dbml() -> anyhow::Result<()> {
        let row_1 = json!({
            "user_id": 1,
            "temperature": 1.2,
            "label": "foo",
            "ready": true,
        });
        let row_2 = json!({
            "user_id": 2,
            "temperature": 2.4,
            "label": "bar",
            "ready": false,
            "description": "not null anymore and prety long so that it's not shown in note",
        });
        let rows = &vec![
            Row::new("1".to_string(), row_1),
            Row::new("2".to_string(), row_2),
        ];

        let schema = TableSchema::from_rows(rows)?;
        let table = Table::new(
            &Project::new_from_id(42),
            "data_source_id",
            utils::now(),
            "table_id",
            "test_dbml",
            "Test records for DBML rendering",
            &Some(schema),
        );

        let expected = r#"Table test_dbml {
  user_id integer [note: 'possible values: 1, 2']
  temperature real [note: 'possible values: 1.2, 2.4']
  label text [note: 'possible values: "foo", "bar"']
  ready boolean [note: 'possible values: TRUE, FALSE']
  description text

  Note: 'Test records for DBML rendering'
}"#
        .to_string();
        assert_eq!(table.render_dbml(), expected);

        Ok(())
    }
}
