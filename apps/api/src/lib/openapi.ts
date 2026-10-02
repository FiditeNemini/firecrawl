import { readFileSync } from "node:fs";
import type { Request } from "express";

type OpenApiSpec = { servers?: { url: string; description?: string }[] };

const specCache = new Map<string, OpenApiSpec>();

function loadSpec(file: string): OpenApiSpec {
  let spec = specCache.get(file);
  if (!spec) {
    spec = JSON.parse(readFileSync(file, "utf8")) as OpenApiSpec;
    specCache.set(file, spec);
  }
  return spec;
}

// hostname or [ipv6] literal, with optional port. Anything else (spaces,
// slashes, userinfo) is ignored rather than echoed into the spec.
const HOST_RE = /^(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

/**
 * Returns the OpenAPI spec with the server that served this request listed
 * first, so Swagger UI's "Try it out" targets this instance (e.g. a
 * self-hosted http://localhost:3002) instead of only the cloud API.
 */
export function getOpenApiSpecForRequest(
  file: string,
  versionPath: string,
  req: Request,
): OpenApiSpec {
  const spec = loadSpec(file);
  const host = req.get("host");
  if (!host || !HOST_RE.test(host)) {
    return spec;
  }

  const url = `${req.protocol}://${host}${versionPath}`;
  const servers = spec.servers ?? [];
  if (servers.some(s => s.url === url)) {
    return spec;
  }

  return {
    ...spec,
    servers: [{ url, description: "This server" }, ...servers],
  };
}
