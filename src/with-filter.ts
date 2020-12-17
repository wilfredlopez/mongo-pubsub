import { $$asyncIterator } from 'iterall'

export type FilterFn = (rootValue?: any, args?: any, context?: any, info?: any) => boolean

export const withFilter = (asyncIteratorFn: () => AsyncIterator<any>, filterFn: FilterFn) => {
  return (_: any, args: any, context: any, info: any): AsyncIterator<any> => {
    const asyncIterator: AsyncIterator<any, any, any> = asyncIteratorFn()

    const getNextPromise = (): any => {
      return asyncIterator
        .next()
        .then(payload => Promise.all([
          payload,
          Promise.resolve(filterFn(payload.value, args, context, info)).catch(() => false),
        ]))
        .then(([payload, filterResult]) => {
          if (filterResult === true) {
            return payload
          }

          // Skip the current value and wait for the next one
          return getNextPromise()
        })
    }

    return {
      next() {
        return getNextPromise()
      },
      return(): Promise<IteratorResult<any, any>> {
        if (asyncIterator.return) {

          return asyncIterator.return()
        }
        return Promise.resolve(this)
      },
      throw(error: any): Promise<IteratorResult<any, any>> {
        if (asyncIterator.throw) {
          return asyncIterator.throw(error)
        }
        return Promise.resolve(this)
      },
      [$$asyncIterator]() {
        return this
      },
    } as any
  }
}
