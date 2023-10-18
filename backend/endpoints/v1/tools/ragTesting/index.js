const { Organization } = require("../../../../models/organization");
const { Queue } = require("../../../../models/queue");
const { RagTest } = require("../../../../models/ragTest");
const {
  userFromSession,
  validSessionForUser,
} = require("../../../../utils/http");
const {
  createRagTestJobRun,
} = require("../../../../utils/jobs/createRagTestJobRun");
const {
  createRagTest,
} = require("../../../../utils/toolHelpers/RagTests/create");
const {
  workspaceSimilaritySearch,
} = require("../../../../utils/toolHelpers/workspaceSimilaritySearch");

process.env.NODE_ENV === "development"
  ? require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` })
  : require("dotenv").config();

function ragTestingEndpoints(app) {
  if (!app) return;

  app.get(
    "/v1/tools/org/:orgSlug/rag-tests",
    [validSessionForUser],
    async function (request, response) {
      try {
        const { orgSlug } = request.params;
        const user = await userFromSession(request);
        if (!user || user.role !== "admin") {
          response.sendStatus(403).end();
          return;
        }

        const organization = await Organization.getWithOwner(user.id, {
          slug: orgSlug,
        });
        if (!organization) {
          response.status(200).json({ ragTests: [], message: "No org found." });
          return;
        }

        const tests = await RagTest.where(
          {
            organization_id: organization.id,
          },
          null,
          { lastRun: "desc" },
          {
            id: true,
            promptText: true,
            frequencyType: true,
            topK: true,
            lastRun: true,
            comparisons: true,
            promptVector: true,
            workspace: true,
            organization: true,
            organization_rag_test_runs: {
              select: {
                id: true,
                status: true,
              },
              orderBy: {
                id: "desc",
              },
            },
          }
        );
        response.status(200).json({ ragTests: tests, message: null });
        return;
      } catch (e) {
        console.log(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/v1/tools/org/:orgSlug/rag-tests/:testId",
    [validSessionForUser],
    async function (request, response) {
      try {
        const { orgSlug, testId } = request.params;
        const user = await userFromSession(request);
        if (!user || user.role !== "admin") {
          response.sendStatus(403).end();
          return;
        }

        const organization = await Organization.getWithOwner(user.id, {
          slug: orgSlug,
        });
        if (!organization) {
          response.status(200).json({ test: null, message: "No org found." });
          return;
        }

        const test = await RagTest.get({ id: Number(testId) });
        const runs = await RagTest.getRuns(test.id, {}, 10, {
          createdAt: "desc",
        });
        response.status(200).json({ test, runs, message: null });
        return;
      } catch (e) {
        console.log(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/v1/tools/org/:orgSlug/rag-tests/:testId",
    [validSessionForUser],
    async function (request, response) {
      try {
        const { orgSlug, testId } = request.params;
        const user = await userFromSession(request);
        if (!user || user.role !== "admin") {
          response.sendStatus(403).end();
          return;
        }

        const organization = await Organization.getWithOwner(user.id, {
          slug: orgSlug,
        });
        if (!organization) {
          response.sendStatus(400).end();
          return;
        }

        const test = await RagTest.get({ id: Number(testId) }, { id: true });
        if (!test) {
          response.sendStatus(400).end();
          return;
        }

        await RagTest.delete({ id: test.id });
        response.sendStatus(200).end();
        return;
      } catch (e) {
        console.log(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/v1/tools/org/:orgSlug/rag-tests/create",
    [validSessionForUser],
    async function (request, response) {
      try {
        const user = await userFromSession(request);
        if (!user || user.role !== "admin") {
          response.sendStatus(403).end();
          return;
        }

        return await createRagTest(user, request, response);
      } catch (e) {
        console.log(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/v1/tools/org/:orgSlug/rag-tests/:testId/run",
    [validSessionForUser],
    async function (request, response) {
      try {
        const { orgSlug, testId } = request.params;
        const user = await userFromSession(request);
        if (!user || user.role !== "admin") {
          response.sendStatus(403).end();
          return;
        }

        const organization = await Organization.getWithOwner(user.id, {
          slug: orgSlug,
        });
        if (!organization) {
          response
            .status(200)
            .json({ success: false, error: "No organization found." });
          return;
        }

        const test = await RagTest.get({ id: Number(testId) }, { id: true });
        if (!test) {
          response
            .status(200)
            .json({ success: false, error: "No test found for that id." });
          return;
        }

        const { job, error } = await createRagTestJobRun(
          organization,
          test.id,
          user
        );
        response.status(200).json({ job, error });
      } catch (e) {
        console.log(e.message, e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { ragTestingEndpoints };