import type { GetServerSideProps } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Workspace } from "@app/lib/models";
import { PlanInvitation } from "@app/lib/models/plan";
import { getCheckoutUrlForUpgrade } from "@app/lib/plans/subscription";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  const token = context.params?.secret as string;
  if (!token) {
    return {
      notFound: true,
    };
  }

  const invitation = await PlanInvitation.findOne({
    where: {
      secret: token,
    },
  });

  if (!invitation) {
    return {
      notFound: true,
    };
  }

  const targetWorkspace = await Workspace.findOne({
    where: {
      id: invitation.workspaceId,
    },
  });
  if (!targetWorkspace || targetWorkspace.sId !== owner.sId) {
    return {
      notFound: true,
    };
  }

  const { checkoutUrl } = await getCheckoutUrlForUpgrade(auth);
  if (!checkoutUrl) {
    return {
      notFound: true,
    };
  }

  return {
    redirect: {
      destination: checkoutUrl,
      permanent: false,
    },
  };
};

export default function Redirect() {
  return <></>;
}
