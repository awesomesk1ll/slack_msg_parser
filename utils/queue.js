/**
* FIFO очередь для уникальных значений
*/
module.exports = {
    items: [],
    push: function (item) {
        if (!this[item]) {
            this[item] = true;
            this.items.push(item);
        }
    },
    shift: function () {
        let res;
        if (this.items.length) {
            res = this.items.shift();
            delete this[res];
        }
        return res;
    },
    length: function () {
        return this.items.length;
    }
}
