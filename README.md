# mongo-pubsub

This package implements the PubSubEngine Interface from the [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions) package and also the new AsyncIterator interface.
It allows you to connect your subscriptions manager to a Redis Pub Sub mechanism to support
multiple subscription manager instances.

## Installation

At first, install the `mongo-pubsub` package:

```
npm install mongo-pubsub
```

As the [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions) package is declared as a peer dependency, you might receive warning about an unmet peer dependency if it's not installed already by one of your other packages. In that case you also need to install it too:

```
npm install graphql-subscriptions
```

## Using as AsyncIterator

Define your GraphQL schema with a `Subscription` type:

```graphql
schema {
  query: Query
  mutation: Mutation
  subscription: Subscription
}

type Subscription {
  somethingChanged: Result
}

type Result {
  id: String
}
```

Now, let's create a simple `MongoPubSub` instance:

```javascript
import { MongoPubSub } from 'mongo-pubsub'
const pubsub = new MongoPubSub()
```

Now, implement your Subscriptions type resolver, using the `pubsub.asyncIterator` to map the event you need:

```javascript
const SOMETHING_CHANGED_TOPIC = 'something_changed'

export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: () => pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC),
    },
  },
}
```

> Subscriptions resolvers are not a function, but an object with `subscribe` method, that returns `AsyncIterable`.

```js
pubsub.publish(SOMETHING_CHANGED_TOPIC, { somethingChanged: { id: '123' } })
```

## Dynamically create a topic based on subscription args passed on the query

```javascript
export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: (_, args) =>
        pubsub.asyncIterator(`${SOMETHING_CHANGED_TOPIC}.${args.relevantId}`),
    },
  },
}
```

## Using both arguments and payload to filter events

```javascript
import { withFilter } from 'graphql-subscriptions'

export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: withFilter(
        (_, args) =>
          pubsub.asyncIterator(`${SOMETHING_CHANGED_TOPIC}.${args.relevantId}`),
        (payload, variables) =>
          payload.somethingChanged.id === variables.relevantId
      ),
    },
  },
}
```

## Creating the Mongo Client

The basic usage is great for development and you will be able to connect to a Redis server running on your system seamlessly. For production usage, it is recommended to send a Redis client from the using code and pass in any options you would like to use. e.g: Connection retry strategy.

```javascript
import { MongoPubSub } from 'mongo-pubsub'

//these are the defaults if you dont pass options
const options = {
  mongoUri: 'mongodb://127.0.0.1/pubsubs',
  dbName: 'pubsubs',
}

const pubsub = new MongoPubSub(options)

pubSub.publish('Test', {
  data: "hello',
});
pubSub.subscribe('Test', message => {
  message.data; // hello
});

```
