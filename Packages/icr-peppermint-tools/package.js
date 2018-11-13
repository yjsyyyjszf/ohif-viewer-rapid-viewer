Package.describe({
    name: 'icr:peppermint-tools',
    summary: 'cornerstoneTools plugin for 3D tools.',
    version: '0.1.0'
});

Package.onUse(function(api) {
    api.versionsFrom('1.4');

    api.use(['ecmascript',
        'standard-app-packages',
        'http',
        'jquery',
        'stylus'
    ]);

    // OHIF dependencies
    api.use([
      'ohif:design',
      'ohif:cornerstone',
      'ohif:core',
      'ohif:hotkeys',
      'ohif:log',
      'icr:series-info-provider',
      'icr:xnat-roi-namespace'
    ]);


    // keyInterface
    api.addFiles('client/lib/keyInterface/brushToolKeyInterface.js', 'client');
    api.addFiles('client/lib/keyInterface/freehandToolKeyInterface.js', 'client');

    // Components

    api.addFiles(
      'client/components/viewer/freehandSetNameDialogs/freehandSetNameDialogs.html',
      'client'
    );
    api.addFiles(
      'client/components/viewer/freehandSetNameDialogs/freehandSetNameDialogs.js',
      'client'
    );
    api.addFiles(
      'client/components/viewer/freehandSetNameDialogs/freehandSetNameDialogs.styl',
      'client'
    );

    api.addFiles(
      'client/components/viewer/volumeManagementDialogs/volumeManagementDialogs.html',
      'client'
    );
    api.addFiles(
      'client/components/viewer/volumeManagementDialogs/volumeManagementDialogs.js',
      'client'
    );
    api.addFiles(
      'client/components/viewer/volumeManagementDialogs/volumeManagementDialogs.styl',
      'client'
    );

    api.addFiles(
      'client/components/viewer/volumeManagementDialogs/roiCollectionList/roiCollectionList.html',
      'client'
    );

    api.addFiles(
      'client/components/viewer/volumeManagementDialogs/volumeList/volumeList.html',
      'client'
    );
    api.addFiles(
      'client/components/viewer/volumeManagementDialogs/volumeList/volumeList.js',
      'client'
    );

    api.addFiles(
      'client/components/viewer/volumeManagementDialogs/volumeListItem/volumeListItem.html',
      'client'
    );
    api.addFiles(
      'client/components/viewer/volumeManagementDialogs/volumeListItem/volumeListItem.js',
      'client'
    );

    api.mainModule('main.js', 'client');
});
