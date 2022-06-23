const https = require('https');

module.exports = function (app) {
  var unsubscribes = [];
  var plugin = {};
  var last_states = {}
  var config
  var name

  plugin.id = 'signalk-pushover-notification-relay';
  plugin.name = 'SignalK Pushover Notification Relay';
  plugin.description = 'SignalK node server notification to Pushover notification relay';

  plugin.start = function (options, restartPlugin) {

    config = options;

    name = app.getSelfPath('name');

    var subscribes = [{
      path: `notifications.*`,
      policy: 'instant'
    }];
    if(config.notifications.length != 0)
      subscribes = config.notifications.map(n => {

        const subscribe = {};

        subscribe.path = `notifications.${n.path}`;
        subscribe.policy = 'instant';

        return subscribe;
      });

    let command = {
      context: 'vessels.self',
      subscribe: subscribes
    };

    app.debug('Subscribe command: ' + JSON.stringify(command, null, 2));

    app.subscriptionmanager.subscribe(
      command,
      unsubscribes,
      subscription_error,
      got_delta
    );

    app.debug('Plugin started with config: ' + JSON.stringify(config, null, 2));
  };

  function subscription_error(err) {

    app.error("Subscription error: " + err);
  }

  function got_delta(notification) {

    handle_notification_delta(app,
                            plugin.id,
                            notification,
                            last_states);
  }

  function handle_notification_delta(app, id, notification, last_states) {

    notification.updates.forEach(u => {

      u.values.forEach(v => {

        if (v.value != null && typeof v.value.message != 'undefined' && v.value.message != null) {

            if ((last_states[v.path] == null && v.value.state != 'normal')
                || (last_states[v.path] != null && last_states[v.path] != v.value.state)) {

            last_states[v.path] = v.value.state;

            var watchedLevels = ['normal', 'warn', 'alert', 'alarm', 'emergency'];

            if(config.notifications.length != 0 && config.notifications.filter(n => v.path == `notifications.${n.path}`) != 'undefined' && config.notifications.filter(n => v.path == `notifications.${n.path}`)[0].levels.length != 0)
              watchedLevels = config.notifications.filter(n => v.path == `notifications.${n.path}`)[0].levels;

            if(watchedLevels.includes(v.value.state)) {

              var title = `${name} - ${v.value.message}`;
              var message = `State of ${v.path} toggled to [${v.value.state}]`;

              var prioritiesDict = {
                'normal': '-2',
                'warn': '-1',
                'alert': '0',
                'alarm': '1',
                'emergency': '2',
              };

              var path = `/1/messages.json?token=${encodeURIComponent(config.api_key)}&user=${encodeURIComponent(config.api_user)}&title=${encodeURIComponent(title)}&message=${encodeURIComponent(message)}&priority=${prioritiesDict[v.value.state]}&retry=30&expire=3600`;
              if(config.notifications.length != 0 
                  && config.notifications.filter(n => v.path == `notifications.${n.path}`) != 'undefined' 
                  && config.notifications.filter(n => v.path == `notifications.${n.path}`)[0].sound != null)
                path += `&sound=${encodeURIComponent(config.notifications.filter(n => v.path == `notifications.${n.path}`)[0].sound)}`;

              app.debug("Path " + path);

              const options = {
                hostname: 'api.pushover.net',
                port: 443,
                path: path,
                method: 'POST',
              };

              const req = https.request(options, res => {

                app.debug(`Status code from Pushover request: ${res.statusCode}`);

                res.on('data', data => {

                  app.debug(`Response from Pushover request: ${data}`);
                });
              });

              req.on('error', error => {

                app.error(`Error from Pushover request: ${error}`);
              });

              req.end();
            }
          }
        }
      });
    });
  }

  plugin.stop = function () {

    unsubscribes.forEach(f => f());
    unsubscribes = [];

    app.debug('Plugin stopped');
  };

  plugin.schema = {
    // The plugin schema
    title: 'Relay Emergency Notifications to Pushover',
    description: 'Pushover Credentials. Go to Pushover dashboard, take note of your user key. Navigate to the bottom of the page, click \'Create an Application/API Token\', fill in the details and note down your API Key.',
    type: 'object',
    required: ['api_user', 'api_key'],
    properties: {
      api_user: {
        type: 'string',
        title: 'Username',
        description: 'The user key from your Pushover account'
      },
      api_key: {
        type: 'string',
        title: 'API Key',
        description: 'The API key from your Pushover dashboard'
      },
      notifications: {
        type: 'array',
        title: 'Notification',
        description: 'Which notifications specifically do you want to be notified for? If none are specified, you will be notified for all state changes of all notification paths.',
        items: {
          type: 'object',
          required: ['path'],
          properties: {
            path: {
              type: 'string',
              title: 'Notification path',
              description: 'The part that comes after \'notification.\' eg: navigation.anchor'
            },
            sound: {
              type: 'string',
              title: 'Notification sound',
              description: 'Override the default notification sound if desired'
            },
            levels: {
              type: 'array',
              title: 'Notification levels',
              description: 'Which notification levels do you want to be notified for? If none are specified, you will be notified for all level changes.',
              items: {
                type: 'string',
                enum: [
                  'normal',
                  'warn',
                  'alert',
                  'alarm',
                  'emergency'
                ]
              }
            }
          }
        }
      }
    }
  };

  return plugin;
};
