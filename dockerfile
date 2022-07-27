FROM satantime/puppeteer-node

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY ./package.json /usr/src/app/
RUN apt update
RUN apt-get -y install chromium-browser
RUN npm install --production && npm cache clean --force

COPY ./ /usr/src/app
ENV NODE_ENV production
ENV PORT 80
EXPOSE 80

CMD [ "npm", "start" ]