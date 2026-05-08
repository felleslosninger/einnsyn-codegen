import { createTypeSpecLibrary } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "einnsyn-codegen",
  diagnostics: {
    "missing-http-service": {
      severity: "error",
      messages: {
        default:
          "No HTTP service found for namespace '{targetNamespace}'. Available namespaces: {availableNamespaces}.",
      },
    },
    "invalid-target-namespace": {
      severity: "error",
      messages: {
        default: "Resolved HTTP service for namespace '{targetNamespace}' had no namespace object.",
      },
    },
  },
});

export const { reportDiagnostic, createDiagnostic } = $lib;
