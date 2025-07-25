/**
 * Electron Builder Configuration
 */
// const { execSync } = require('child_process')

const config = {
    appId: 'net.nouroni.launcher',
    productName: 'Nour Launcher',
    artifactName: '${productName}-setup-${channel}_${version}-${os}_${arch}.${ext}',

    copyright: 'Copyright © 2025 Muspelheim',

    asar: true,
    compression: 'maximum',

    files: [
        '*.{js,json,txt,md}',
        '{app,libraries,build}/**/*',
        'node_modules/**/*.{js,json}',
        // '!{dist,.gitignore,.vscode,docs,dev-app-update.yml,.nvmrc,.eslintrc.json}',
        // '!flatpack/**'
    ],

    extraResources: ['libraries'],

    // Windows Configuration
    win: {
        publish: ['github'],
        target: [
            {
                target: 'nsis',
                arch: 'x64',
            },
        ]
    },

    // Windows Installer Configuration - NSIS
    nsis: {
        // Installer type
        oneClick: false, // Use assisted installer rather than one-click
        allowElevation: true, // Allow installer to request admin rights
        allowToChangeInstallationDirectory: true, // Let user choose install location
        selectPerMachineByDefault: true,

        // Installation and shortcuts
        perMachine: false, // Default to per-user, but show option for per-machine
        createDesktopShortcut: true, // Create desktop shortcut
        createStartMenuShortcut: true, // Create start menu shortcut
        shortcutName: 'Nour Launcher', // Shortcut name
        runAfterFinish: true, // Run app after installation
        menuCategory: 'Nour Launcher', // Start menu category

        // Branding elements
        installerIcon: 'build/icon.ico', // Installer icon
        uninstallerIcon: 'build/uninstall.ico', // Uninstaller icon
        installerHeader: 'build/header.bmp', // Header image (150x57px)

        // Installer options
        include: 'build/installer.nsh', // Custom NSIS include script
        license: 'LICENSE.txt', // License file
        multiLanguageInstaller: true, // Support multiple languages
        // deleteAppDataOnUninstall: false, // Don't delete app data by default (Oneclick installer only)

        // Automatic updates
        // differentialPackage: true, // Enable differential updates
    },

    // macOS Configuration
    mac: {
        target: [
            {
                target: 'dmg',
                arch: ['x64', 'arm64'],
            },
        ],
        category: 'public.app-category.games',
    },

    // Linux Configuration
    linux: {
        target: [
            {
                target: 'AppImage',
                arch: ['x64', 'arm64'],
            },
            {
                target: 'deb',
                arch: ['x64', 'arm64'],
            },
            {
                target: 'rpm',
                arch: ['x64', 'arm64'],
            },
        ],
        maintainer: 'Muspelheim',
        vendor: 'Muspelheim',
        synopsis: 'Modded Minecraft Launcher for use in Nours twitch server.',
        description:
            'Custom launcher which allows users to join modded servers. All mods, configurations, and updates are handled automatically.',
        category: 'Game',
    },

    directories: {
        buildResources: 'build',
        output: 'dist',
    },

    // GitHub Release Configuration
    publish: {
        provider: 'github',
        repo: 'NourLauncher',
        owner: 'Muspelheim-Hosting',
        releaseType: 'draft',
    },
}

module.exports = config
