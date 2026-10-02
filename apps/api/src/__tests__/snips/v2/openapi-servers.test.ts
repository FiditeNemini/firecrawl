import request, { TEST_API_URL } from "./lib";

describe("OpenAPI spec servers", () => {
  it("lists the requesting server first, then the cloud API", async () => {
    const response = await request(TEST_API_URL)
      .get("/openapi.json")
      .set("Host", "localhost:3002");

    expect(response.statusCode).toBe(200);
    expect(response.body.servers[0]).toEqual({
      url: "http://localhost:3002/v1",
      description: "This server",
    });
    expect(response.body.servers).toContainEqual({
      url: "https://api.firecrawl.dev/v1",
    });
    expect(Object.keys(response.body.paths)).toContain("/scrape");
  });

  it("uses the v0 base path for the v0 spec", async () => {
    const response = await request(TEST_API_URL)
      .get("/openapi-v0.json")
      .set("Host", "localhost:3002");

    expect(response.statusCode).toBe(200);
    expect(response.body.servers[0].url).toBe("http://localhost:3002/v0");
  });

  it("ignores a malformed Host header", async () => {
    const response = await request(TEST_API_URL)
      .get("/openapi.json")
      .set("Host", "evil.com/phish?x=");

    expect(response.statusCode).toBe(200);
    expect(response.body.servers).toEqual([
      { url: "https://api.firecrawl.dev/v1" },
    ]);
  });
});
