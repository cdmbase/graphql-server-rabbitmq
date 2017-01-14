// tslint:disable

/*
 * Below are the RabbitMQ test.
 */

import { AMQPSubscription, GrapQLAmqpOptions } from './rabbitmqApollo';
import { AmqpPubSub } from 'graphql-rabbitmq-subscriptions';
import { expect } from 'chai';
import { stringify } from 'querystring';
//import testSuite, { Schema, CreateAppOptions } from 'graphql-server-integration-testsuite';
const request = require('supertest-as-promised');
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLString,
  GraphQLError,
  BREAK
} from 'graphql';
import {ConsoleLogger} from "rokot-log";
import {error} from "util";


const logger = ConsoleLogger.create("subscription-test", { level: "trace" });

const QueryRootType = new GraphQLObjectType({
  name: 'QueryRoot',
  fields: {
    test: {
      type: GraphQLString,
      args: {
        who: {
          type: GraphQLString
        }
      },
      resolve: (root, args) => 'Hello ' + (args['who'] || 'World')
    },
    thrower: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: () => { throw new Error('Throws!'); }
    },
    context: {
      type: GraphQLString,
      resolve: (obj, args, context) => context,
    }
  }
});

const TestSchema = new GraphQLSchema({
  query: QueryRootType,
  mutation: new GraphQLObjectType({
    name: 'MutationRoot',
    fields: {
      writeTest: {
        type: QueryRootType,
        resolve: () => ({})
      }
    }
  })
});

function urlString(urlParams?: any): string {
  let str = '/graphql';
  if (urlParams) {
    str += ('?' + stringify(urlParams));
  }
  return str;
}

// function createApp(options: CreateAppOptions = {}) {
//   options.graphqlOptions = options.graphqlOptions || { schema: Schema };
//
//   const newOptions = Object.assign({}, ...options.graphqlOptions, logger);
//   const app = new AMQPSubscription(newOptions);
//   return app;
// }

describe('rabbitmqApollo', () => {
  it('throws error if called without schema', function(){
    expect(() => (new AMQPSubscription(undefined as GrapQLAmqpOptions))).to.throw('Apollo Server requires options.');
  });

  // it('throws an error if called with more than one argument', function(){
  //   expect(() => (<any>(new AMQPSubscription))({}, 'x')).to.throw(
  //     'Apollo Server expects exactly one argument, got 2');
  // });
});

// describe('integration:RabbitMQ', () => {
//   testSuite(createApp);
// });


const version = 'modern';
describe(`GraphQL-AMQP (apolloServer) tests for ${version} rabbitmq`, () => {
  describe('publish functionality', () => {

    it('allows queries from amqp publish', (done) => {
      const app = new AMQPSubscription({
        schema: TestSchema,
        logger,
      });


      const pubsub = new AmqpPubSub({logger});
      const data = {query: '{ test(who: "World") }'};
      pubsub.publish("graphql", data);

      const callback = function(payload) {
        try {
          expect(payload).to.deep.equal({
            data: {
              test: 'Hello World'
            }
          });
          setTimeout(done(), 2);
        } catch (e) {
          setTimeout(done(e), 2);
        }

      };
      app.listenToQueries(callback).then(() => {
        app.unsubscribe();
      })
    });

    it('allows for mutation from amqp publish', (done) => {

      // A simple schema which includes a mutation.
      const TestMutationSchema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'QueryRoot',
          fields: {
            test: { type: GraphQLString }
          }
        }),
        mutation: new GraphQLObjectType({
          name: 'MutationType',
          fields: {
            testMutation: {
              type: GraphQLString,
              args: { echo: { type: GraphQLString } },
              resolve(root, { echo }) {
                return `not really a mutation, but who cares: ${echo}`;
              },
            },
          },
        })
      });

      const app = new AMQPSubscription({
        schema: TestMutationSchema,
        logger,
      });

      const pubsub = new AmqpPubSub({logger});

      const query = 'mutation test($echo: String){ testMutation(echo: $echo) }';
      const variables = { echo: 'world' };
      const data = {query, variables };
      pubsub.publish("graphql", data);

      const callback = function(payload) {
        try {
          expect(payload).to.deep.equal({
            data: {
              testMutation: 'not really a mutation, but who cares: world'
            }
          });
          setTimeout(done(), 4);
        } catch(e) {

          setTimeout(done(e), 4);
        }

      };
      app.listenToQueries(callback).then(() => {
        app.unsubscribe();
      });
    });
  });

  describe('Error handling functionality', () => {
    it('handles field errors caught by GraphQL', (done) => {

      const app = new AMQPSubscription({
        schema: TestSchema,
        logger,
      });

      const pubsub = new AmqpPubSub({logger});

      const query = '{thrower}';
      const data = {query};
      pubsub.publish("graphql", data);

      const callback = function(payload) {
        try {
          expect(payload).to.deep.equal({
            data: null,
            errors: [{
              message: 'Throws!',
              locations: [{line: 1, column: 2}],
              path: ["thrower"]
            }]
          });
          setTimeout(done(), 4);
        } catch(e) {
          setTimeout(done(e), 4);
        }

      };
      app.listenToQueries(callback).then(() => {
        app.unsubscribe();
      });
    });

    it('allows for custom error formatting to sanitize', (done) => {

      const app = new AMQPSubscription({
        schema: TestSchema,
        formatError(error) {
          return { message: 'Custom error format: ' + error.message };
        },
        logger,
      });

      const pubsub = new AmqpPubSub({logger});

      const query = '{thrower}';
      const data = {query};
      pubsub.publish("graphql", data);

      const callback = function(payload) {
        try {
          expect(payload).to.deep.equal({
            data: null,
            errors: [ {
              message: 'Custom error format: Throws!',
            } ]
          });
          setTimeout(done(), 4);
        } catch(e) {
          setTimeout(done(e), 4);
        }

      };
      app.listenToQueries(callback).then(() => {
        app.unsubscribe();
      });
    });

    it('allows for custom error formatting to elaborate', (done) => {

      const app = new AMQPSubscription({
        schema: TestSchema,
        logger,
        formatError(error) {
          return {
            message: error.message,
            locations: error.locations,
            stack: 'Stack trace'
          };
        }
      });

      const pubsub = new AmqpPubSub({logger});

      const query = '{thrower}';
      const data = {query};
      pubsub.publish("graphql", data);

      const callback = function(payload) {
        try {
          expect(payload).to.deep.equal({
            data: null,
            errors: [ {
              message: 'Throws!',
              locations: [ { line: 1, column: 2 } ],
              stack: 'Stack trace',
            } ]
          });
          setTimeout(done(), 4);
        } catch(e) {
          setTimeout(done(e), 4);
        }

      };
      app.listenToQueries(callback).then(() => {
        app.unsubscribe();
      });
    });
  });

  describe('Custom validation rules', () => {
      const AlwaysInvalidRule = function (context) {
        return {
          enter() {
            context.reportError(new GraphQLError(
              'AlwaysInvalidRule was really invalid!'
            ));
            return BREAK;
          }
        };
      };

      it('Do not execute a query if it do not pass the custom validation.', (done) => {

        const app = new AMQPSubscription({
          schema: TestSchema,
          logger,
          validationRules: [ AlwaysInvalidRule ],
        });

        const pubsub = new AmqpPubSub({logger});

        const query = '{thrower}';
        const data = {query};
        pubsub.publish("graphql", data);

        const callback = function(payload) {
          try {
            expect(payload).to.deep.equal({
              errors: [
                {
                  locations: undefined,
                  message: 'AlwaysInvalidRule was really invalid!',
                  path: undefined,
                },
              ]
            });
            setTimeout(done(), 4);
          } catch(e) {
            setTimeout(done(e), 4);
          }

        };
        app.listenToQueries(callback).then(() => {
          app.unsubscribe();
        });
      });
    });
});
