import { createTypeSpecLibrary } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "einnsyn-codegen",
  diagnostics: {},
});

export const { reportDiagnostic, createDiagnostic } = $lib;
