import { EmitContext, ignoreDiagnostics } from '@typespec/compiler';
import { getAllHttpServices } from '@typespec/http';
import javaBackendEmitter from './targets/java-backend/emit.js';
import javaClientEmitter from './targets/java-client/emit.js';

export async function $onEmit(context: EmitContext) {
  if (context.program.compilerOptions.noEmit) {
    return;
  }

  const program = context.program;
  const [httpService] = ignoreDiagnostics(getAllHttpServices(program)).filter(
    (s) => s.namespace.name === 'EInnsyn',
  );

  const eInnsynNamespace = httpService.namespace;
  if (!eInnsynNamespace) {
    return;
  }

  await javaBackendEmitter(context, eInnsynNamespace);
  await javaClientEmitter(context, eInnsynNamespace);
}
