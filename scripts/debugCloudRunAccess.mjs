import { execSync } from "node:child_process";

const ENDPOINT = "http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45";
const SESSION_ID = "cc9b57";
const RUN_ID = process.env.DEBUG_RUN_ID || "pre-fix";

function sendLog(hypothesisId, location, message, data = {}) {
  // #region agent log
  fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      runId: RUN_ID,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function runCommand(command) {
  try {
    const output = execSync(command, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      output: (error?.stderr || error?.message || "").toString().trim(),
    };
  }
}

const activeProject = runCommand("gcloud config get-value project");
const activeAccount = runCommand("gcloud config get-value account");
const authAccounts = runCommand("gcloud auth list --format='value(account,status)'");

sendLog("H1", "scripts/debugCloudRunAccess.mjs:41", "Active gcloud context", {
  activeProject: activeProject.output,
  activeAccount: activeAccount.output,
  authAccounts: authAccounts.output,
});

const targetService = runCommand(
  "gcloud run services describe billing-app --region us-central1 --project gen-lang-client-0296053913 --format='value(status.url,status.latestReadyRevisionName)'",
);
sendLog("H2", "scripts/debugCloudRunAccess.mjs:49", "Target project service describe result", {
  ok: targetService.ok,
  output: targetService.output.slice(0, 500),
});

const currentProjectService = runCommand(
  "gcloud run services describe billing-app --region us-central1 --project crypto-quasar-327717 --format='value(status.url,status.latestReadyRevisionName)'",
);
sendLog("H3", "scripts/debugCloudRunAccess.mjs:56", "Current project service describe result", {
  ok: currentProjectService.ok,
  output: currentProjectService.output.slice(0, 500),
});

const cloudBuildList = runCommand(
  "gcloud builds list --project gen-lang-client-0296053913 --limit 1 --sort-by='~createTime' --format='value(id,status,createTime,substitutions.COMMIT_SHA)'",
);
sendLog("H4", "scripts/debugCloudRunAccess.mjs:63", "Cloud Build latest status check", {
  ok: cloudBuildList.ok,
  output: cloudBuildList.output.slice(0, 500),
});

const triggerList = runCommand(
  "gcloud builds triggers list --project gen-lang-client-0296053913 --format='value(name,disabled)'",
);
sendLog("H5", "scripts/debugCloudRunAccess.mjs:70", "Cloud Build trigger access check", {
  ok: triggerList.ok,
  output: triggerList.output.slice(0, 500),
});

const altAccountService = runCommand(
  "gcloud run services describe billing-app --region us-central1 --project gen-lang-client-0296053913 --account=genaujunior@gmail.com --format='value(status.url,status.latestReadyRevisionName)'",
);
sendLog("H6", "scripts/debugCloudRunAccess.mjs:77", "Alternate account service describe result", {
  ok: altAccountService.ok,
  output: altAccountService.output.slice(0, 500),
});

const publicHeaders = runCommand(
  "curl -sSI https://billing-app-saisynpc3a-uc.a.run.app | rg -i '^(HTTP/|date:|server:|etag:|last-modified:|x-cloud-trace-context:)'",
);
sendLog("H7", "scripts/debugCloudRunAccess.mjs:84", "Public production URL headers", {
  ok: publicHeaders.ok,
  output: publicHeaders.output.slice(0, 500),
});

const successfulBuilds = runCommand(
  "gcloud builds list --project gen-lang-client-0296053913 --account=genaujunior@gmail.com --filter='status=SUCCESS' --limit=5 --sort-by='~createTime' --format='value(id,status,createTime,substitutions.COMMIT_SHA)'",
);
sendLog("H8", "scripts/debugCloudRunAccess.mjs:91", "Recent successful Cloud Build deployments", {
  ok: successfulBuilds.ok,
  output: successfulBuilds.output.slice(0, 700),
});

const recentRevisions = runCommand(
  "gcloud run revisions list --service=billing-app --region=us-central1 --project=gen-lang-client-0296053913 --account=genaujunior@gmail.com --limit=5 --sort-by='~metadata.creationTimestamp' --format='value(metadata.name,metadata.creationTimestamp,status.conditions[0].status,status.conditions[0].type)'",
);
sendLog("H9", "scripts/debugCloudRunAccess.mjs:98", "Recent Cloud Run revisions for billing-app", {
  ok: recentRevisions.ok,
  output: recentRevisions.output.slice(0, 700),
});

const runErrorLogs = runCommand(
  "gcloud run services logs read billing-app --region=us-central1 --project=gen-lang-client-0296053913 --account=genaujunior@gmail.com --limit=15 --format='value(timestamp,severity,textPayload)'",
);
sendLog("H10", "scripts/debugCloudRunAccess.mjs:105", "Recent Cloud Run runtime logs", {
  ok: runErrorLogs.ok,
  output: runErrorLogs.output.slice(0, 1200),
});

console.log(
  JSON.stringify({
    activeProject,
    activeAccount,
    authAccounts,
    targetService,
    currentProjectService,
    cloudBuildList,
    triggerList,
    altAccountService,
    publicHeaders,
    successfulBuilds,
    recentRevisions,
    runErrorLogs,
  }),
);
