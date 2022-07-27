/**
* FIFO очередь для уникальных сообщений
*/
module.exports = {
    items: [],
    sorted: false,
    push: function (item) {
        // console.log('pushing item to queue', item);
        if (!this[item["id"]]) {
            // console.log('pushed');
            this[item["id"]] = true;
            this.items.push(item);
            this.sorted = false;
        }
    },
    shift: function () {
        let res;
        if (this.items.length) {
            if (!this.sorted) {
                this.items.sort((a,b) => a.epoch - b.epoch);
                this.sorted = true;
            }
            res = this.items.shift();
            delete this[res["id"]];
        }
        return res;
    },
    length: function () {
        return this.items.length;
    }
}
