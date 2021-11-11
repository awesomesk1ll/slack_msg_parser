module.exports = (cluster, data) => {
    
    // {
    //     row: 'd',
    //     number: 3,
    //     stageGroupName: 'oct2021',
    //     stageName: 'Core program',
    //     user: {
    //       id: '77d2f47d-6ab4-4328-a6dc-3e55fde006ca',
    //       login: 'lnisha@student.21-school.ru',
    //       avatarUrl: '/services/storage/download/global/ad9d2d3c-5b03-11eb-ae93-0242ac130002?path=default_avatar/noavatar.png',
    //       __typename: 'User'
    //     },
    //     experience: {
    //       id: '77d2f47d-6ab4-4328-a6dc-3e55fde006ca',
    //       value: 660,
    //       level: [Object],
    //       __typename: 'UserExperience'
    //     },
    //     __typename: 'CurrentWorkstationUser'
    //   }
    return {
        nick: data.user.login.split('@')[0],
        seat: `${cluster}-${data.row}${data.number}`,
        exp: data.experience.value,
        level: data.experience.level.id - 100,
    }
}