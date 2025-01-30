import { EmitContext, ignoreDiagnostics } from '@typespec/compiler';
import { getAllHttpServices } from '@typespec/http';
import javaBackendEmitter from './targets/java-backend/emit.js';
import javaClientEmitter from './targets/java-client/emit.js';
import { EmitterOptions } from './types.js';

export async function $onEmit(context: EmitContext<EmitterOptions>) {
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

  javaBackendEmitter(context, eInnsynNamespace);
  javaClientEmitter(context, eInnsynNamespace);
}
