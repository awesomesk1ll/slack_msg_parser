/**
* Получает данные из таблицы.
* @param {object} apiClient - google spreadsheets обжект.
* @async
* @returns {Array<Array>} (матрица данных)
*/
const getRows = async ( sheet ) => {
    const rows = await sheet.getRows();
    rows.forEach((row) => {
        row._history = (row.history) ? JSON.parse(row.history) : [];
    });
    return rows;
};

const setInfo = (info, status) => {
    info[3].status = status ? 'ok' : 'fail';
    info[3].update = (new Date()).getTime();
    // console.log('setting info', info[3]);
    if (info[3].history && info[3]._history) {
        // console.log('setting history', info[3].history, info[3]._history);
        info[3]._history = [...info[3]._history].slice(0, 2000);
        info[3].history = JSON.stringify(info[3]._history);
    }
    info[3].save();
}

module.exports = {
    getRows,
    setInfo
}