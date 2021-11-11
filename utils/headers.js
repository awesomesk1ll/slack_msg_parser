module.exports = (id) => ({
    "headers": {
      "accept": "*/*",
      "accept-language": "en-EN",
      "cache-control": "no-cache",
      "content-type": "application/json",
      "pragma": "no-cache",
      "schoolid": "46e7d965-21e9-4936-bea9-f5ea0d1fddf2",
      "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"97\", \"Chromium\";v=\"97\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "userrole": "STUDENT"
    },  
    "referrer": "https://edu.21-school.ru/campus",
    "referrerPolicy": "strict-origin-when-cross-origin",
    "body": `{\"operationName\":\"getCampusPlanOccupied\",\"variables\":{\"clusterId\":${id}},\"query\":\"query getCampusPlanOccupied($clusterId: ID!) {\\n  student {\\n    getClusterPlanStudentsByClusterId(clusterId: $clusterId) {\\n      occupiedPlaces {\\n        row\\n        number\\n        stageGroupName\\n        stageName\\n        user {\\n          id\\n          login\\n          avatarUrl\\n          __typename\\n        }\\n        experience {\\n          id\\n          value\\n          level {\\n            id\\n            range {\\n              id\\n              levelCode\\n              leftBorder\\n              rightBorder\\n              __typename\\n            }\\n            __typename\\n          }\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\"}`,
    "method": "POST",
    "mode": "cors",
    "credentials": "include" 
  })