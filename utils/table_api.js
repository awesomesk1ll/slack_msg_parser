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

const setInfo = (info, status, events) => {
    info[1].status = status ? 'ok' : 'fail';
    info[1].update = (new Date()).getTime();
    info[1].events = events;
    if (info[1].history && info[1]._history) {
        info[1]._history = [{[info[1].status]: info[1].update}, ...info[1]._history].slice(0, 1440);
        info[1].history = JSON.stringify(info[1]._history);
    }
    info[1].save();
}

module.exports = {
    getRows,
    setInfo
}