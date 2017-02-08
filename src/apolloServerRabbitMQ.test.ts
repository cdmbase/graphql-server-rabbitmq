// tslint:disable

/*
 * Below are the RabbitMQ test.
 */

import { AMQPSubscription, GrapQLAmqpOptions } from './rabbitmqApollo';
import { AmqpPubSub } from 'graphql-rabbitmq-subscriptions';
import { expect } from 'chai';
import { stringify } from 'querystring';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLString,
  GraphQLError,
  BREAK
} from 'graphql';
import { ConsoleLogger } from "cdm-logger";
import { error } from "util";

const graphqlEndpoint = "graphql";
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


// function createApp(options: CreateAppOptions = {}) {
//   options.graphqlOptions = options.graphqlOptions || { schema: Schema };
//
//   const newOptions = Object.assign({}, ...options.graphqlOptions, logger);
//   const app = new AMQPSubscription(newOptions);
//   return app;
// }

describe('rabbitmqApollo', () => {
  it('throws error if called without schema', function () {
    expect(() => (new AMQPSubscription(undefined as GrapQLAmqpOptions))).to.throw('Apollo Server requires options.');
  });

  // it('throws an error if called with more than one argument', function(){
  //   expect(() => (<any>(new AMQPSubscription))({}, 'x')).to.throw(
  //     'Apollo Server expects exactly one argument, got 2');
  // });
});

const version = 'modern';
describe(`GraphQL-AMQP (apolloServer) tests for ${version} rabbitmq`, function () {

  describe('publish functionality', () => {
    it('allows queries from amqp publish', (done) => {
      const app = new AMQPSubscription({
        schema: TestSchema,
        logger,
        graphqlEndpoint,
      });


      const pubsub = new AmqpPubSub({ logger });
      const data = { query: '{ test(who: "World") }' };


      const callback = (payload) => {
        try {
          expect(payload).to.deep.equal({
            data: {
              test: 'Hello World'
            }
          });
          setTimeout(() => done(), 2);
        } catch (e) {
          setTimeout(() => done(e), 2);
        }
        app.unsubscribe();

      };
      app.listenToQueries(callback).then(() => {
        pubsub.publish(graphqlEndpoint, data);
      });
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
        graphqlEndpoint,
      });

      const pubsub = new AmqpPubSub({ logger });

      const query = 'mutation test($echo: String){ testMutation(echo: $echo) }';
      const variables = { echo: 'world' };
      const data = { query, variables };

      const callback = function (payload) {
        try {
          expect(payload).to.deep.equal({
            data: {
              testMutation: 'not really a mutation, but who cares: world'
            }
          });
          setTimeout(() => done(), 2);
        } catch (e) {

          setTimeout(() => done(e), 2);
        }
        app.unsubscribe();
      };
      app.listenToQueries(callback).then(() => {
        pubsub.publish(graphqlEndpoint, data);
      })
    });
  });

  describe('Error handling functionality', () => {
    it('handles field errors caught by GraphQL', (done) => {

      const app = new AMQPSubscription({
        schema: TestSchema,
        logger,
        graphqlEndpoint,
      });

      const pubsub = new AmqpPubSub({ logger });
      const query = '{thrower}';
      const data = { query };

      const callback = function (payload) {
        try {
          expect(payload).to.deep.equal({
            data: null,
            errors: [{
              message: 'Throws!',
              locations: [{ line: 1, column: 2 }],
              path: ["thrower"]
            }]
          });
          setTimeout(() => done(), 2);
        } catch (e) {
          setTimeout(() => done(e), 2);
        }
        app.unsubscribe();
      };
      app.listenToQueries(callback).then(() => {
        pubsub.publish(graphqlEndpoint, data);
        //      setTimeout(() => app.unsubscribe(), 50);
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

      const query = '{thrower}';
      const data = { query };
      const pubsub = new AmqpPubSub({ logger });

      const callback = function (payload) {
        try {
          expect(payload).to.deep.equal({
            data: null,
            errors: [{
              message: 'Custom error format: Throws!',
            }]
          });
          setTimeout(() => done(), 2);
        } catch (e) {
          setTimeout(() => done(e), 2);
        }
        app.unsubscribe();
      };
      app.listenToQueries(callback).then(() => {
        pubsub.publish(graphqlEndpoint, data);
      });
    });

    it('allows for custom error formatting to elaborate', (done) => {

      const app = new AMQPSubscription({
        schema: TestSchema,
        logger,
        graphqlEndpoint,
        formatError(error) {
          return {
            message: error.message,
            locations: error.locations,
            stack: 'Stack trace'
          };
        }
      });

      const pubsub = new AmqpPubSub({ logger });
      const query = '{thrower}';
      const data = { query };
      pubsub.publish(graphqlEndpoint, data);

      const callback = function (payload) {
        try {
          expect(payload).to.deep.equal({
            data: null,
            errors: [{
              message: 'Throws!',
              locations: [{ line: 1, column: 2 }],
              stack: 'Stack trace',
            }]
          });
          setTimeout(() => done(), 10);
        } catch (e) {
          setTimeout(() => done(e), 10);
        }
        app.unsubscribe();
      };
      app.listenToQueries(callback).then(() => {
        pubsub.publish(graphqlEndpoint, data);
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
        graphqlEndpoint,
        validationRules: [AlwaysInvalidRule],
      });

      const pubsub = new AmqpPubSub({ logger });
      const query = '{thrower}';
      const data = { query };

      const callback = function (payload) {
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
          setTimeout(() => done(), 10);
        } catch (e) {
          setTimeout(() => done(e), 10);
        }
        app.unsubscribe();

      };
      app.listenToQueries(callback).then(() => {
        pubsub.publish(graphqlEndpoint, data);
      });
    });
  });
});
