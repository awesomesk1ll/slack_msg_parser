require('dotenv').config();
const request = require('superagent');
const mapping = {
    id: 'entry.420444868',
    data: 'entry.1569028194',
}

const send = async (url, data, entries) => {
    const payload = {};
    for (key in data) {
        if (entries[key]) {
            payload[entries[key]] = data[key];
        }
    }
    // console.log('sending payload', payload);
    return await request.post(url).type('form').send(payload)
                        .end((err, res) => {
                            if (err || !res.ok) {
                                return false;
                            } else {
                                return true;
                            }
                        });
}

module.exports = {
    mapping,
    send
}
