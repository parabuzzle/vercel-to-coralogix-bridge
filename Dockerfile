FROM node:alpine

# create & set working directory
RUN mkdir -p /usr/src
WORKDIR /usr/src

EXPOSE 8080

# copy source files
COPY . /usr/src

# install dependencies
RUN yarn

# start app
CMD ["node", "--dns-result-order=ipv4first", "index.js"]