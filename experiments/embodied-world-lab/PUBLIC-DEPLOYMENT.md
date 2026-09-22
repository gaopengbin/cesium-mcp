# Public Cesium × Jev demo

Public entry: https://laogao.xyz/cesium-jev/

Use `?lang=zh-CN` or `?lang=en` for a shareable language preference. The language button preserves all URL settings and reloads the scene; it stops a running task rather than carrying an in-flight model decision across a reload. The saved preference is used when the URL does not specify a language. Both interfaces use the same geometry, model calls and safety controller.

## Build and release

The `Build Cesium Jev demo` GitHub workflow installs locked dependencies, runs type checking and tests on Linux, builds the static frontend and a dependency-free Node server bundle, and uploads `cesium-jev-release` with `SHA256SUMS`. No model credential is used during the build.

Download this artifact locally with `gh run download`. Verify its checksum, then upload to the Tencent host with the pinned SSH key. The maintained activation script is `scripts/cesium-jev/deploy-linux.sh` in the private `gaopengbin-dashboard` control repository. It validates archive paths and checksums, creates an immutable release, tests the service and Nginx, and retains a rollback backup. The production server never downloads from GitHub.

Frontend base and Cesium worker base are both `/cesium-jev/`. Nginx serves the static files and compressed copies, and proxies only `/cesium-jev/api/` to the loopback Node service on port 9097. The existing site routes are retained. PM2 provides restart persistence.

## Runtime configuration

The model credential lives only in `/srv/laogao/secrets/cesium-jev/runtime.env`, with restricted file permissions, loaded by Node's `--env-file` option. Do not include this file in artifacts, Git or PM2's public environment output.

- `TYPESAFE_API_KEY`: server-only TypeSafe credential.
- `PUBLIC_ORIGIN`: exact allowed HTTPS origin.
- `PORT`: loopback listener, currently 9097.
- `JEV_BUDGET_PATH`: persistent quota counter outside releases.
- `JEV_DAILY_LIMIT`: shared daily maximum, initially 5,000 requests in UTC.

The proxy requires matching Host and Origin for model POST requests, accepts only validated observations, limits the body to 16 KiB and upstream time to 15 seconds, and permits four concurrent calls. Each client IP can make at most 180 requests per UTC hour; only the shared daily count is persisted. The API does not persist submitted coordinates, observations or credentials. Rate limits bound a public demonstration; they are not a paid-service authentication system.

## Scope

PLATEAU buildings cover the prepared Tokyo area. Outside it, navigation runs on explicitly simplified ground. Jev selects geometry-generated candidates and short motion intents; local code performs pathfinding, collision checking and character movement. This is not global autonomous driving, visual world understanding or a production robot controller.

Verify both languages, a real model response and a completed route on the public site after activation. HTTP health alone is not product acceptance.
