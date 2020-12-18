import { $$asyncIterator } from "iterall"
import { EventEmitter } from "events"

export const eventEmitterAsyncIterator = <T = any>(eventEmitter: EventEmitter, eventsNames: string | string[], commonMessageHandler = (...args: any[]) => args[0]): AsyncIterator<T, any, any> => {
    const pullQueue: ((...args: any[]) => void)[] = []
    const pushQueue: T[] = []
    const eventsArray =
        typeof eventsNames === "string" ? [eventsNames] : eventsNames
    let listening = true

    const pushValue = ({ payload: event }: { payload: T }) => {
        const value = commonMessageHandler(event)
        if (pullQueue.length !== 0) {
            const v = pullQueue.shift()!
            v({ value, done: false })
        } else {
            pushQueue.push(value)
        }
    }

    const pullValue = () => {
        return new Promise<IteratorResult<T, any>>(resolve => {
            if (pushQueue.length !== 0) {
                resolve({ value: pushQueue.shift() as any, done: false })
            } else {
                pullQueue.push(resolve)
            }
        })
    }

    const emptyQueue = () => {
        if (listening) {
            listening = false
            removeEventListeners()
            pullQueue.forEach(resolve => resolve({ value: undefined, done: true }))
            pullQueue.length = 0
            pushQueue.length = 0
        }
    }

    const addEventListeners = () => {
        for (const eventName of eventsArray) {
            eventEmitter.addListener(eventName, pushValue)
        }
    }

    const removeEventListeners = () => {
        for (const eventName of eventsArray) {
            eventEmitter.removeListener(eventName, pushValue)
        }
    }

    addEventListeners()
    return {
        next(): Promise<IteratorResult<T, any>> {
            return listening ? pullValue() : (this as any).return()
        },
        return(value?: any | PromiseLike<any>): Promise<IteratorResult<T, any>> {
            emptyQueue()

            return Promise.resolve({ value: undefined, done: true })
        },
        throw(error: any): Promise<IteratorResult<T, any>> {
            emptyQueue()

            return Promise.reject(error)
        },
        [$$asyncIterator as any]() {
            return this
        }
    }
}

