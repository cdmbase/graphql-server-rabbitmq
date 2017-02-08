import {
  ExecutionResult,
  formatError,
} from 'graphql';
import { GraphQLOptions, runQuery } from 'graphql-server-core';
import {
  RabbitMqConnectionFactory,
  RabbitMqSubscriber,
  IRabbitMqConnectionConfig,
} from "rabbitmq-pub-sub";
import * as Logger from 'bunyan';
import { createChildLogger } from './childLogger';

export interface GrapQLAmqpOptions extends GraphQLOptions {
  config?: IRabbitMqConnectionConfig,
  logger: Logger;
  graphqlEndpoint?: string;
}
export class AMQPSubscription {


  constructor(options: GrapQLAmqpOptions) {
    if (!options) {
      throw new Error('Apollo Server requires options.');
    }

    if (arguments.length > 1) {
      // TODO: test this
      throw new Error(`Apollo Server expects exactly one argument, got ${arguments.length}`);
    }
    const config = options.config || { host: "127.0.0.1", port: 5672 };
    const { logger } = options;
    this.logger = createChildLogger(logger, 'AmqpSubscriptionServer');
    this.graphqlEndpoint = options.graphqlEndpoint || "graphql"

    const factory = new RabbitMqConnectionFactory(logger, config);
    this.listener = new RabbitMqSubscriber(logger, factory);

    this.graphqlOptions = options;
  }

  public listenToQueries(cb?: Function): Promise<any> {
    return new Promise((resolve, reject) => this.listener.subscribe(this.graphqlEndpoint,
      msg => this.onMessage(msg).then(m => cb ? cb(m) : m))
      .then(disposer => {
        this.unsubscribeChannel = disposer;
        return resolve();
      }).catch(err => {
        this.logger.error(err, "failed to recieve message from queue '%s'", this.graphqlEndpoint);
        reject()
      }));
  }

  public unsubscribe() {
    this.unsubscribeChannel().then(() => {
      this.logger.trace("cancelled channel from subscribing to queue '%s'", this.graphqlEndpoint);
    }).catch(err => {
      this.logger.error(err, "channel cancellation failed from queue '%j'", this.graphqlEndpoint);
    });
  }

  private onMessage(queryOptions: any): Promise<ExecutionResult> {
    this.logger.trace("message received to process is '(%j)'", queryOptions);

    // TODO: only support single object
    let isBatch = false;
    // TODO: do something different here if the body is an array.
    // Throw an error if body isn't either array or object.
    // if (!Array.isArray(queryOptions)) {
    //   isBatch = false;
    //   queryOptions = [queryOptions];
    // }

    // Shallow clone context for queries in batches. This allows
    // users to distinguish multiple queries in the batch and to
    // modify the context object without interfering with each other.
    let context = this.graphqlOptions.context;
    if (isBatch) {
      context = Object.assign({}, context || {});
    }

    const formatErrorFn = this.graphqlOptions.formatError || formatError;
    let params = {
      schema: this.graphqlOptions.schema,
      query: queryOptions.query,
      variables: queryOptions.variables,
      context: context,
      rootValue: this.graphqlOptions.rootValue,
      operationName: queryOptions.operationName,
      logFunction: this.graphqlOptions.logFunction,
      validationRules: this.graphqlOptions.validationRules,
      formatError: formatErrorFn,
      formatResponse: this.graphqlOptions.formatResponse,
      debug: this.graphqlOptions.debug,
    };

    if (this.graphqlOptions.formatParams) {
      params = this.graphqlOptions.formatParams(params);
    }

    return runQuery(params)
  }
  private listener: any;
  private logger: Logger;
  private graphqlOptions: GraphQLOptions;
  private graphqlEndpoint: string;
  private unsubscribeChannel: any;
}


