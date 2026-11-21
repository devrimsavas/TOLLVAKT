import swaggerAutogen from "swagger-autogen";
import path from "node:path";

const doc = {
  info: {
    title: "Tollvakt API",
    description:
      "Customs classification and duty estimation for Norwegian importers and exporters, built on Tolletaten's open data.",
    version: "0.1.0",
  },
  servers: [{ url: "/" }],
  tags: [{ name: "General", description: "API status" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

const outputFile = path.join(process.cwd(), "swagger_output.json");
const endpointsFiles = ["./dist/app.js"];

swaggerAutogen({ openapi: "3.0.0" })(outputFile, endpointsFiles, doc);
