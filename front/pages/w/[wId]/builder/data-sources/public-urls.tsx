import {
  Button,
  Cog6ToothIcon,
  ContextItem,
  FolderOpenIcon,
  Page,
  PlusIcon,
  Popup,
} from "@dust-tt/sparkle";
import { GlobeAltIcon } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  readOnly: boolean;
  dataSources: DataSourceType[];
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();

  if (!owner || !plan || !subscription || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const allDataSources = await getDataSources(auth);
  const dataSources = allDataSources.filter(
    (ds) => ds.connectorProvider === "webcrawler"
  );

  return {
    props: {
      owner,
      subscription,
      plan,
      readOnly,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourcesView({
  owner,
  subscription,
  plan,
  readOnly,
  dataSources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);

  const {
    submit: handleCreateDataSource,
    isSubmitting: isSubmittingCreateDataSource,
  } = useSubmitFunction(async () => {
    // Enforce plan limits: DataSources count.
    if (
      plan.limits.dataSources.count != -1 &&
      dataSources.length >= plan.limits.dataSources.count
    ) {
      setShowDatasourceLimitPopup(true);
    } else {
      void router.push(`/w/${owner.sId}/builder/data-sources/new-public-url`);
    }
  });

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_url",
      })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Websites"
          icon={GlobeAltIcon}
          description="Manage public URLs as data sources for the workspace."
        />

        {dataSources.length > 0 ? (
          <div className="relative">
            <Page.SectionHeader
              title=""
              description=""
              action={
                !readOnly
                  ? {
                      label: "Add a public URL",
                      variant: "primary",
                      icon: PlusIcon,
                      onClick: handleCreateDataSource,

                      disabled: isSubmittingCreateDataSource,
                    }
                  : undefined
              }
            />
            <Popup
              show={showDatasourceLimitPopup}
              chipLabel={`${plan.name} plan`}
              description={`You have reached the limit of data sources (${plan.limits.dataSources.count} data sources). Upgrade your plan for unlimited datasources.`}
              buttonLabel="Check Dust plans"
              buttonClick={() => {
                void router.push(`/w/${owner.sId}/subscription`);
              }}
              onClose={() => {
                setShowDatasourceLimitPopup(false);
              }}
              className="absolute bottom-8 right-0"
            />
          </div>
        ) : (
          <EmptyCallToAction
            label="Create a new Public URL"
            onClick={handleCreateDataSource}
          />
        )}

        <ContextItem.List>
          {dataSources.map((ds) => (
            <ContextItem
              key={ds.name}
              title={ds.name}
              visual={
                <ContextItem.Visual
                  visual={({ className }) =>
                    FolderOpenIcon({
                      className: className + " text-element-600",
                    })
                  }
                />
              }
              action={
                <Button.List>
                  <Button
                    variant="secondary"
                    icon={Cog6ToothIcon}
                    onClick={() => {
                      void router.push(
                        `/w/${
                          owner.sId
                        }/builder/data-sources/${encodeURIComponent(ds.name)}`
                      );
                    }}
                    label="Manage"
                  />
                </Button.List>
              }
            >
              <ContextItem.Description>
                <div className="text-sm text-element-700">{ds.description}</div>
              </ContextItem.Description>
            </ContextItem>
          ))}
        </ContextItem.List>
      </Page.Vertical>
    </AppLayout>
  );
}
