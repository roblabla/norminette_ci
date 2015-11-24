/*if (!Symbol.asyncIterator)
  Symbol.asyncIterator = new Symbol('asyncIterator');*/

module.exports = {
  map(fn) {
    let self = this;
    return {
      next: async function() {
        let x = await self.next();
        let clone;
        if (x.value)
          clone = { done: x.done, value: await fn(x.value) };
        else
          clone = { done: x.done };
        return clone;
      }
    };
  },
  filter(fn) {
    let self = this;
    return {
      next: async function() {
        let x;
        while (!(x = await self.next()).done) {
          if (await fn(x.value))
            return (x);
        }
        return x;
      }
    };
  },
  reduce: async function reduce(fn, acc) {
    let self = this;
    let x;
    let i = 0;
    while (!(x = await self.next()).done) {
      acc = await fn(acc, x.value, i, self);
      i++;
    }
    return acc;
  }
};
