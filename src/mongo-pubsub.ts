import { PubSubEngine } from 'graphql-subscriptions'
import { PubSubAsyncIterator } from './pubsub-async-iterator'

import { MongoClient, Db, InsertOneWriteOpResult } from "mongodb"
import { EventEmitter } from 'events'

type OnMessage<T> = (message: T) => void

interface SubsFNS<T> {
  fn: OnMessage<T>,
  id: number
  trigger: string
}

const DEFAULT_MONGO_PS_URI = "mongodb://127.0.0.1/pubsubs"
const DEFAULT_DB_NAME = 'pubsubs'
export interface MongoPubSubOptions {
  eventEmitter?: EventEmitter
  mongoUri?: string,
  dbName?: string
}

export interface PubSubRedisOptions {
  triggerTransform?: TriggerTransform
  connectionListener?: (err: Error) => void
  reviver?: Reviver
  serializer?: Serializer
  deserializer?: Deserializer
}


const INSTANCES: { [key: string]: MongoPubSub | null } = {}


export class MongoPubSub implements PubSubEngine {
  private _mongoClient!: MongoClient
  private _database!: Db
  private readonly subscriptions: { [key: number]: [SubsFNS<any>] }
  private readonly subsRefsMap: { [trigger: string]: Array<number> }
  private readonly emitter: EventEmitter
  private readonly dbName: string
  private readonly mongoUri: string
  private subIdCounter: number
  constructor(options?: MongoPubSubOptions) {
    this.mongoUri = options?.mongoUri || DEFAULT_MONGO_PS_URI
    this.dbName = options?.dbName || DEFAULT_DB_NAME
    this.emitter = options?.eventEmitter ? options.eventEmitter : new EventEmitter({
      captureRejections: true
    })
    this.subsRefsMap = {}
    this.subscriptions = {}
    this.subIdCounter = 0
    const INSTANCE = INSTANCES[this.mongoUri]
    if (!INSTANCE) {
      INSTANCES[this.mongoUri] = this
    } else {
      return INSTANCE
    }
    // this.__init()
  }


  async close() {
    this.emitter.removeAllListeners()
    await this._database.dropDatabase()
    await this._mongoClient.close()
    INSTANCES[this.mongoUri] = null
    return Promise.resolve()
  }

  async subscribe<T = any>(triggerName: string, onMessage: OnMessage<T>, _options?: Object): Promise<number> {
    await this.__ensureInit()
    const id = this.subIdCounter = this.subIdCounter + 1
    //unique id
    this.subscriptions[id] = [{ id: id, fn: onMessage, trigger: triggerName }]
    const refs = this.subsRefsMap[triggerName]
    if (refs && refs.length > 0) {
      this.subsRefsMap[triggerName] = [...refs, id]
      return Promise.resolve(id)

    }
    this.emitter.addListener(triggerName, onMessage)
    this.subsRefsMap[triggerName] = [
      ...(this.subsRefsMap[triggerName] || []),
      id,
    ]
    return Promise.resolve(id)
  }
  public asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
    return new PubSubAsyncIterator<T>(this, triggers)
  }
  unsubscribe(subId: number) {
    const sub = this.subscriptions[subId]

    if (!sub) throw new Error(`There is no subscription of id "${subId}"`)
    const fn = sub[0]
    const refs = this.subsRefsMap[fn.trigger]

    if (!refs) throw new Error(`There is no subscription of id "${subId}"`)

    if (refs.length === 1) {
      // unsubscribe from specific channel and pattern match
      this.emitter.removeListener(fn.trigger, fn.fn)
      delete this.subsRefsMap[fn.trigger]
    } else {
      const index = refs.indexOf(subId)
      this.subsRefsMap[fn.trigger] = index === -1
        ? refs
        : [...refs.slice(0, index), ...refs.slice(index + 1)]
    }

    delete this.subscriptions[subId]


    // const subs = this.subscriptions[subId]
    // if (!subs) {
    //   return
    // }
    // const exists = subs.findIndex(s => s.id === subId)
    // if (exists !== -1) {
    //   const data = subs[exists]
    //   this.emitter.removeListener(data.trigger, data.fn)
    //   this.subscriptions[subId] = subs.filter(sfn => sfn.id !== subId)
    //   if (this.subscriptions[subId].length === 0) {
    //     delete this.subscriptions[subId]
    //   }
    // }
  }
  async publish<T = any>(triggerName: string, payload: T): Promise<void> {
    await this.__ensureInit()
    return new Promise((res, rej) => {
      this._database.collection(triggerName, (err, collection) => {
        if (err) {
          rej(err)
          return
        }
        collection.insertOne(payload, (err, doc) => {

          if (err) {
            rej(err)
          }
          // this.emitter.emit(triggerName, doc.ops)
          this.onMessage(triggerName, doc)
          res()
        })

      })
    })
  }
  private onMessage(triggerName: string, message: InsertOneWriteOpResult<any>) {
    const subscriberIds = this.subsRefsMap[triggerName]

    // Don't work for nothing..
    if (!subscriberIds || !subscriberIds.length) return

    const parsedMessage = parseM(message) // JSON.stringify...

    function parseM(data: InsertOneWriteOpResult<any>) {
      const info = Object.assign({}, data.ops[0])
      delete info._id
      return info
    }

    for (const subId of subscriberIds) {
      const subsListener = this.subscriptions[subId]
      subsListener.forEach(({ fn }) => fn(parsedMessage))
    }
    //DELETE FROM DATABASE AFTER IS SENT.
    this._database.collection(triggerName).deleteOne({
      _id: message.ops[0]._id
    })
    // this._database.collection(triggerName).deleteMany({})
  }


  private async __ensureInit() {
    if (!this._mongoClient) {
      await this.__init()
    }
  }

  private async __init() {
    try {
      const client = await MongoClient.connect(this.mongoUri, {
        useUnifiedTopology: true
      })
      this._mongoClient = client
      this._database = client.db(this.dbName)
      Object.freeze(this._database)
      Object.freeze(this._mongoClient)
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }

  }
}


export type Path = Array<string | number>
export type Trigger = string | Path
export type TriggerTransform = (
  trigger: Trigger,
  channelOptions?: unknown,
) => string
export type Reviver = (key: any, value: any) => any
export type Serializer = (source: any) => string
export type Deserializer = (source: string) => any
