import { MongoClient, Db, MongoClientOptions } from "mongodb"
// import { PubSubEngine } from 'apollo-server-express'
import { PubSubEngine } from 'graphql-subscriptions'
import { EventEmitter } from 'events'
import { PubSubAsyncIterator } from './pubsub-async-iterator'
// import { eventEmitterAsyncIterator } from './eventEmitterAsyncIterator'

type OnMessage<T> = (message: T) => void

interface SubsFNS<T> {
  fn: OnMessage<T>,
  id: number
  trigger: string
}

const DEFAULT_MONGO_PS_URI = "mongodb://127.0.0.1/pubsubs"
const DEFAULT_DB_NAME = 'pubsubs'


type EncodingType = "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex" | undefined

export interface MongoPubSubOptions {
  eventEmitter?: EventEmitter
  mongoUri?: string,
  dbName?: string
  clientOptions?: MongoClientOptions
  encoding?: EncodingType
}




const INSTANCES: { [key: string]: MongoPubSub | null } = {}


export class MongoPubSub implements PubSubEngine {
  private _mongoClient!: MongoClient
  private _database!: Db
  private readonly subscriptions: { [key: number]: SubsFNS<any> }
  private readonly subsRefsMap: { [trigger: string]: Array<number> }
  protected ee: EventEmitter
  private readonly dbName: string
  private readonly mongoUri: string
  private subIdCounter: number
  private encoding: EncodingType
  private inTransaction: ((...args: any[]) => Promise<any>) | null = null
  private clientOptions: MongoClientOptions
  constructor(options?: MongoPubSubOptions) {
    this.mongoUri = options?.mongoUri || DEFAULT_MONGO_PS_URI
    this.dbName = options?.dbName || DEFAULT_DB_NAME
    this.ee = options?.eventEmitter ? options.eventEmitter : new EventEmitter({
      captureRejections: true
    })
    this.encoding = options?.encoding
    this.clientOptions = options?.clientOptions || { useUnifiedTopology: true }
    this.subsRefsMap = {}
    this.subscriptions = {}
    this.subIdCounter = 0
    const INSTANCE = INSTANCES[this.mongoUri]
    if (!INSTANCE) {
      INSTANCES[this.mongoUri] = this
    } else {
      return INSTANCE
    }

  }


  async getHistory(triggerName: string) {
    await this.__ensureInit()
    const cursor = this._database.collection(triggerName).find({})
    const allData = await cursor.toArray()
    return allData
  }

  async dropDatabase() {
    try {

      await this._database?.dropDatabase()
    } catch (error) {

    }
  }

  async close(dropDb?: boolean) {
    await this.__ensureInit()
    //avoid async code running that depends on the database
    if (this.inTransaction) {
      await this.inTransaction()
    }

    if (dropDb) {
      await this.dropDatabase()
    }
    this.ee.removeAllListeners()
    if (this._mongoClient && this._mongoClient.isConnected()) {
      await this._mongoClient.close()
    }
    // INSTANCES[this.mongoUri] = null
    return Promise.resolve()
  }


  get listenersCount() {
    let count = 0
    for (let key in this.subsRefsMap) {
      const value = this.subsRefsMap[key]
      count += value.length
    }
    return count
  }


  async subscribe<T = any>(triggerName: string, onMessage: OnMessage<T>, _options?: Object): Promise<number> {
    await this.__ensureInit()
    this.subIdCounter = this.subIdCounter + 1
    const id = this.subIdCounter
    //unique id
    if (this.subscriptions[id]) {
      throw new Error('THIS IS NOT SUPPOSED TO EXIST')
    }
    this.subscriptions[id] = { id: id, fn: onMessage, trigger: triggerName }
    const refs = this.subsRefsMap[triggerName]
    if (refs && refs.length > 0) {
      this.subsRefsMap[triggerName] = [...refs, id]
      return Promise.resolve(id)

    }
    this.ee.addListener(triggerName, onMessage)

    //test

    //end test
    this.subsRefsMap[triggerName] = [
      ...(this.subsRefsMap[triggerName] || []),
      id,
    ]
    return Promise.resolve(id)
  }
  public asyncIterator<T = any>(triggers: string | string[]): AsyncIterator<T> {
    return new PubSubAsyncIterator<T>(this, triggers, this.ee, this.onMessage.bind(this))
  }
  unsubscribe(subId: number) {
    const sub = this.subscriptions[subId]

    if (!sub) throw new Error(`There is no subscription of id "${subId}"`)
    const fn = sub
    const refs = this.subsRefsMap[fn.trigger]

    if (!refs) throw new Error(`There is no subscription of id "${subId}"`)

    if (refs.length === 1) {
      // unsubscribe from specific channel and pattern match
      this.ee.removeListener(fn.trigger, fn.fn)
      delete this.subsRefsMap[fn.trigger]
    } else {
      const index = refs.indexOf(subId)
      this.subsRefsMap[fn.trigger] = index === -1
        ? refs
        : [...refs.slice(0, index), ...refs.slice(index + 1)]
    }

    delete this.subscriptions[subId]
  }
  /**
   * 
   * @param triggerName NAME OF THE EVENT
   * @param payload Object or data to publish.
   */
  async publish<T = any>(triggerName: string, payload: T): Promise<void> {
    await this.__ensureInit()
    const collection = this._database.collection(triggerName)
    const promise = () => collection.insertOne({ data: payload, createdAt: new Date() })
    this.inTransaction = promise
    const doc = await promise()
    this.inTransaction = null
    // this.emitter.emit(triggerName, doc.ops[0].data)
    //ALTERNATIVE TO EVENT EMITTER.
    //REMOVE ALL THE CODE THAT USES EVENT EMITTER AND THE EVENT EMITTER ITSELF AND USE THIS NEXT LINE INSTEAD.
    this.onMessage(triggerName, doc.ops[0].data)
  }
  parseM(data: Buffer) {
    // const info = Object.assign({}, data.ops[0])
    // delete info._id
    const messageString = data.toString(this.encoding)
    let parsedMessage
    try {
      parsedMessage = JSON.parse(messageString)
    } catch (e) {
      parsedMessage = messageString
    }
    return parsedMessage
  }
  private onMessage(triggerName: string, message: Buffer) {
    const subscriberIds = this.subsRefsMap[triggerName]

    // Don't work for nothing..
    if (!subscriberIds || !subscriberIds.length) return

    const parsedMessage = this.parseM(message) // JSON.stringify...

    /**
     * 
     * the message user emits is being saved with the data key on the database. 
     */


    for (const subId of subscriberIds) {
      const subsListener = this.subscriptions[subId]
      subsListener.fn(parsedMessage)
    }
    return parsedMessage
  }


  private async __ensureInit() {
    if (!this._mongoClient || !this._mongoClient.isConnected()) {
      await this.__init()
    }
  }

  private async __init() {
    if (!this._mongoClient || !this._mongoClient.isConnected())
      try {
        const promise = MongoClient.connect(this.mongoUri, this.clientOptions)
        this.inTransaction = () => promise
        const client = await promise
        this._mongoClient = client
        this._database = client.db(this.dbName)
        this.inTransaction = null

        Object.freeze(this._database)
        Object.freeze(this._mongoClient)
        return Promise.resolve(true)
      } catch (error) {
        return Promise.resolve(false)
      }
    return Promise.resolve(true)
  }
}

