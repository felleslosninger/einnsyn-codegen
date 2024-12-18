import {
  EmitContext,
  ignoreDiagnostics,
  Model,
  Namespace,
  Program,
} from '@typespec/compiler';
import {
  getAllHttpServices,
  getHttpOperation,
  HttpOperation,
} from '@typespec/http';
import javaBackendEmitter from './targets/java-backend/emit.js';

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

  javaBackendEmitter(context, eInnsynNamespace);
}
