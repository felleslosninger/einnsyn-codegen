import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getHttpResponseStatusCode,
  hasHttpResponseBody,
} from '../dist/utils/httpResponseUtils.js';
import { getExtendedParameterModel } from '../dist/utils/operationsUtils.js';

function createModel(name, baseModel = undefined) {
  return { name, baseModel };
}

function createQueryParameter(name, model = undefined) {
  return {
    param: {
      name,
      sourceProperty: model ? { model } : undefined,
    },
  };
}

test('getExtendedParameterModel prefers the most common source model', () => {
  const baseModel = createModel('CommonQuery');
  const uncommonModel = createModel('RareQuery');

  const parameters = [
    createQueryParameter('offset', baseModel),
    createQueryParameter('limit', baseModel),
    createQueryParameter('rare', uncommonModel),
    createQueryParameter('search'),
  ];

  const [extendedModel, remainingParameters] = getExtendedParameterModel({
    parameters,
  });

  assert.equal(extendedModel, baseModel);
  assert.deepEqual(remainingParameters, [parameters[2], parameters[3]]);
});

test('getExtendedParameterModel returns all parameters when none share a model', () => {
  const parameters = [
    createQueryParameter('offset'),
    createQueryParameter('limit'),
  ];

  const [extendedModel, remainingParameters] = getExtendedParameterModel({
    parameters,
  });

  assert.equal(extendedModel, undefined);
  assert.deepEqual(remainingParameters, parameters);
});

test('hasHttpResponseBody only reports true when a response content has a body', () => {
  const responseWithBody = {
    statusCodes: 200,
    type: { kind: 'Model', name: 'WrappedResponse' },
    responses: [{ body: { type: { kind: 'String', value: 'ok' } } }],
  };
  const responseWithoutBody = {
    statusCodes: 204,
    type: { kind: 'Model', name: 'NoContentResponse' },
    responses: [{}],
  };

  assert.equal(hasHttpResponseBody(responseWithBody), true);
  assert.equal(hasHttpResponseBody(responseWithoutBody), false);
  assert.equal(getHttpResponseStatusCode(responseWithBody), 200);
  assert.equal(getHttpResponseStatusCode(responseWithoutBody), 204);
});
