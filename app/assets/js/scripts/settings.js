// Requirements
const os = require('os')
const semver = require('semver')

const DropinModUtil = require('./assets/js/dropinmodutil')
const { MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR } = require('./assets/js/ipcconstants')

const settingsState = {
    invalid: new Set(),
}

function bindSettingsSelect() {
    for (let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]

        selectedDiv.onclick = e => {
            e.stopPropagation()
            closeSettingsSelect(e.target)
            e.target.nextElementSibling.toggleAttribute('hidden')
            e.target.classList.toggle('select-arrow-active')
        }
    }
}

function closeSettingsSelect(el) {
    for (let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]
        const optionsDiv = ele.getElementsByClassName('settingsSelectOptions')[0]

        if (!(selectedDiv === el)) {
            selectedDiv.classList.remove('select-arrow-active')
            optionsDiv.setAttribute('hidden', '')
        }
    }
}

/* If the user clicks anywhere outside the select box,
then close all select boxes: */
document.addEventListener('click', closeSettingsSelect)

bindSettingsSelect()

function bindFileSelectors() {
    for (let ele of document.getElementsByClassName('settingsFileSelButton')) {
        ele.onclick = async e => {
            const isJavaExecSel = ele.id === 'settingsJavaExecSel'
            const directoryDialog = ele.hasAttribute('dialogDirectory') && ele.getAttribute('dialogDirectory') == 'true'
            const properties = directoryDialog ? ['openDirectory', 'createDirectory'] : ['openFile']

            const options = {
                properties,
            }

            if (ele.hasAttribute('dialogTitle')) {
                options.title = ele.getAttribute('dialogTitle')
            }

            if (isJavaExecSel && process.platform === 'win32') {
                options.filters = [
                    { name: Lang.queryJS('settings.fileSelectors.executables'), extensions: ['exe'] },
                    { name: Lang.queryJS('settings.fileSelectors.allFiles'), extensions: ['*'] },
                ]
            }

            const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), options)
            if (!res.canceled) {
                ele.previousElementSibling.value = res.filePaths[0]
                if (isJavaExecSel) {
                    await populateJavaExecDetails(res.filePaths[0])
                }
            }
        }
    }
}

bindFileSelectors()

/**
 * General Settings Functions
 */

/**
 * Bind value validators to the settings UI elements. These will
 * validate against the criteria defined in the ConfigManager (if
 * any). If the value is invalid, the UI will reflect this and saving
 * will be disabled until the value is corrected. This is an automated
 * process. More complex UI may need to be bound separately.
 */
function initSettingsValidators() {
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
    Array.from(sEls).map((v, index, arr) => {
        const vFn = ConfigManager['validate' + v.getAttribute('cValue')]
        if (typeof vFn === 'function') {
            if (v.tagName === 'INPUT') {
                if (v.type === 'number' || v.type === 'text') {
                    v.addEventListener('keyup', e => {
                        const v = e.target
                        if (!vFn(v.value)) {
                            settingsState.invalid.add(v.id)
                            v.setAttribute('error', '')
                            settingsSaveDisabled(true)
                        } else {
                            if (v.hasAttribute('error')) {
                                v.removeAttribute('error')
                                settingsState.invalid.delete(v.id)
                                if (settingsState.invalid.size === 0) {
                                    settingsSaveDisabled(false)
                                }
                            }
                        }
                    })
                }
            }
        }
    })
}

/**
 * Validate the provided executable path and display the data on
 * the UI.
 *
 * @param {string} execPath The executable path to populate against.
 */
async function populateJavaExecDetails(execPath) {
    const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    const details = await validateSelectedJvm(ensureJavaDirIsRoot(execPath), server.effectiveJavaOptions.supported)

    if (details != null) {
        settingsJavaExecDetails.innerHTML = Lang.queryJS('settings.java.selectedJava', {
            version: details.semverStr,
            vendor: details.vendor,
        })
    } else {
        settingsJavaExecDetails.innerHTML = Lang.queryJS('settings.java.invalidSelection')
    }
}

function populateJavaReqDesc(server) {
    settingsJavaReqDesc.innerHTML = Lang.queryJS('settings.java.requiresJava', {
        major: server.effectiveJavaOptions.suggestedMajor,
    })
}

function populateJvmOptsLink(server) {
    const major = server.effectiveJavaOptions.suggestedMajor
    settingsJvmOptsLink.innerHTML = Lang.queryJS('settings.java.availableOptions', { major: major })
    if (major >= 12) {
        settingsJvmOptsLink.href = `https://docs.oracle.com/en/java/javase/${major}/docs/specs/man/java.html#extra-options-for-java`
    } else if (major >= 11) {
        settingsJvmOptsLink.href =
            'https://docs.oracle.com/en/java/javase/11/tools/java.html#GUID-3B1CE181-CD30-4178-9602-230B800D4FAE'
    } else if (major >= 9) {
        settingsJvmOptsLink.href = `https://docs.oracle.com/javase/${major}/tools/java.htm`
    } else {
        settingsJvmOptsLink.href = `https://docs.oracle.com/javase/${major}/docs/technotes/tools/${
            process.platform === 'win32' ? 'windows' : 'unix'
        }/java.html`
    }
}

/**
 * Load configuration values onto the UI. This is an automated process.
 */
async function initSettingsValues() {
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')

    for (const v of sEls) {
        const cVal = v.getAttribute('cValue')
        const serverDependent = v.hasAttribute('serverDependent') // Means the first argument is the server id.
        const gFn = ConfigManager['get' + cVal]
        const gFnOpts = []
        if (serverDependent) {
            gFnOpts.push(ConfigManager.getSelectedServer())
        }
        if (typeof gFn === 'function') {
            if (v.tagName === 'INPUT') {
                if (v.type === 'number' || v.type === 'text') {
                    // Special Conditions
                    if (cVal === 'JavaExecutable') {
                        v.value = gFn.apply(null, gFnOpts)
                        await populateJavaExecDetails(v.value)
                    } else if (cVal === 'DataDirectory') {
                        v.value = gFn.apply(null, gFnOpts)
                    } else if (cVal === 'JVMOptions') {
                        v.value = gFn.apply(null, gFnOpts).join(' ')
                    } else {
                        v.value = gFn.apply(null, gFnOpts)
                    }
                } else if (v.type === 'checkbox') {
                    v.checked = gFn.apply(null, gFnOpts)
                }
            } else if (v.tagName === 'DIV') {
                if (v.classList.contains('rangeSlider')) {
                    // Special Conditions
                    if (cVal === 'MinRAM' || cVal === 'MaxRAM') {
                        let val = gFn.apply(null, gFnOpts)
                        if (val.endsWith('M')) {
                            val = Number(val.substring(0, val.length - 1)) / 1024
                        } else {
                            val = Number.parseFloat(val)
                        }

                        v.setAttribute('value', val)
                    } else {
                        v.setAttribute('value', Number.parseFloat(gFn.apply(null, gFnOpts)))
                    }
                }
            }
        }
    }
}

/**
 * Save the settings values.
 */
function saveSettingsValues() {
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
    Array.from(sEls).map((v, index, arr) => {
        const cVal = v.getAttribute('cValue')
        const serverDependent = v.hasAttribute('serverDependent') // Means the first argument is the server id.
        const sFn = ConfigManager['set' + cVal]
        const sFnOpts = []
        if (serverDependent) {
            sFnOpts.push(ConfigManager.getSelectedServer())
        }
        if (typeof sFn === 'function') {
            if (v.tagName === 'INPUT') {
                if (v.type === 'number' || v.type === 'text') {
                    // Special Conditions
                    if (cVal === 'JVMOptions') {
                        if (!v.value.trim()) {
                            sFnOpts.push([])
                            sFn.apply(null, sFnOpts)
                        } else {
                            sFnOpts.push(v.value.trim().split(/\s+/))
                            sFn.apply(null, sFnOpts)
                        }
                    } else {
                        sFnOpts.push(v.value)
                        sFn.apply(null, sFnOpts)
                    }
                } else if (v.type === 'checkbox') {
                    sFnOpts.push(v.checked)
                    sFn.apply(null, sFnOpts)
                    // Special Conditions
                    if (cVal === 'AllowPrerelease') {
                        changeAllowPrerelease(v.checked)
                    }
                }
            } else if (v.tagName === 'DIV') {
                if (v.classList.contains('rangeSlider')) {
                    // Special Conditions
                    if (cVal === 'MinRAM' || cVal === 'MaxRAM') {
                        let val = Number(v.getAttribute('value'))
                        if (val % 1 > 0) {
                            val = val * 1024 + 'M'
                        } else {
                            val = val + 'G'
                        }

                        sFnOpts.push(val)
                        sFn.apply(null, sFnOpts)
                    } else {
                        sFnOpts.push(v.getAttribute('value'))
                        sFn.apply(null, sFnOpts)
                    }
                }
            }
        }
    })
}

let selectedSettingsTab = 'settingsTabAccount'

/**
 * Modify the settings container UI when the scroll threshold reaches
 * a certain poin.
 *
 * @param {UIEvent} e The scroll event.
 */
function settingsTabScrollListener(e) {
    if (e.target.scrollTop > Number.parseFloat(getComputedStyle(e.target.firstElementChild).marginTop)) {
        document.getElementById('settingsContainer').setAttribute('scrolled', '')
    } else {
        document.getElementById('settingsContainer').removeAttribute('scrolled')
    }
}

/**
 * Bind functionality for the settings navigation items.
 */
function setupSettingsTabs() {
    Array.from(document.getElementsByClassName('settingsNavItem')).map(val => {
        if (val.hasAttribute('rSc')) {
            val.onclick = () => {
                settingsNavItemListener(val)
            }
        }
    })
}

/**
 * Settings nav item onclick lisener. Function is exposed so that
 * other UI elements can quickly toggle to a certain tab from other views.
 *
 * @param {Element} ele The nav item which has been clicked.
 * @param {boolean} fade Optional. True to fade transition.
 */
function settingsNavItemListener(ele, fade = true) {
    if (ele.hasAttribute('selected')) {
        return
    }
    const navItems = document.getElementsByClassName('settingsNavItem')
    for (let i = 0; i < navItems.length; i++) {
        if (navItems[i].hasAttribute('selected')) {
            navItems[i].removeAttribute('selected')
        }
    }
    ele.setAttribute('selected', '')
    let prevTab = selectedSettingsTab
    selectedSettingsTab = ele.getAttribute('rSc')

    document.getElementById(prevTab).onscroll = null
    document.getElementById(selectedSettingsTab).onscroll = settingsTabScrollListener

    if (fade) {
        $(`#${prevTab}`).fadeOut(250, () => {
            $(`#${selectedSettingsTab}`).fadeIn({
                duration: 250,
                start: () => {
                    settingsTabScrollListener({
                        target: document.getElementById(selectedSettingsTab),
                    })
                },
            })
        })
    } else {
        $(`#${prevTab}`).hide(0, () => {
            $(`#${selectedSettingsTab}`).show({
                duration: 0,
                start: () => {
                    settingsTabScrollListener({
                        target: document.getElementById(selectedSettingsTab),
                    })
                },
            })
        })
    }
}

const settingsNavDone = document.getElementById('settingsNavDone')

/**
 * Set if the settings save (done) button is disabled.
 *
 * @param {boolean} v True to disable, false to enable.
 */
function settingsSaveDisabled(v) {
    settingsNavDone.disabled = v
}

function fullSettingsSave() {
    saveSettingsValues()
    saveModConfiguration()
    ConfigManager.save()
    saveDropinModConfiguration()
    saveShaderpackSettings()
}

/* Closes the settings view and saves all data. */
settingsNavDone.onclick = () => {
    fullSettingsSave()
    switchView(getCurrentView(), VIEWS.landing)
}

/**
 * Account Management Tab
 */

const msftLoginLogger = LoggerUtil.getLogger('Microsoft Login')
const msftLogoutLogger = LoggerUtil.getLogger('Microsoft Logout')

// Bind the add mojang account button.
// document.getElementById('settingsAddMojangAccount').onclick = (e) => {
//     switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
//         loginViewOnCancel = VIEWS.settings
//         loginViewOnSuccess = VIEWS.settings
//        loginCancelEnabled(true)
//     })
// }

// Bind the add microsoft account button.
document.getElementById('settingsAddMicrosoftAccount').onclick = e => {
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        ipcRenderer.send(MSFT_OPCODE.OPEN_LOGIN, VIEWS.settings, VIEWS.settings)
    })
}

// Bind reply for Microsoft Login.
ipcRenderer.on(MSFT_OPCODE.REPLY_LOGIN, (_, ...arguments_) => {
    if (arguments_[0] === MSFT_REPLY_TYPE.ERROR) {
        const viewOnClose = arguments_[2]
        console.log(arguments_)
        switchView(getCurrentView(), viewOnClose, 500, 500, () => {
            if (arguments_[1] === MSFT_ERROR.NOT_FINISHED) {
                // User cancelled.
                msftLoginLogger.info('Login cancelled by user.')
                return
            }

            // Unexpected error.
            setOverlayContent(
                Lang.queryJS('settings.msftLogin.errorTitle'),
                Lang.queryJS('settings.msftLogin.errorMessage'),
                Lang.queryJS('settings.msftLogin.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
    } else if (arguments_[0] === MSFT_REPLY_TYPE.SUCCESS) {
        const queryMap = arguments_[1]
        const viewOnClose = arguments_[2]

        // Error from request to Microsoft.
        if (Object.prototype.hasOwnProperty.call(queryMap, 'error')) {
            switchView(getCurrentView(), viewOnClose, 500, 500, () => {
                // TODO Dont know what these errors are. Just show them I guess.
                // This is probably if you messed up the app registration with Azure.
                let error = queryMap.error // Error might be 'access_denied' ?
                let errorDesc = queryMap.error_description
                console.log('Error getting authCode, is Azure application registered correctly?')
                console.log(error)
                console.log(errorDesc)
                console.log('Full query map: ', queryMap)
                setOverlayContent(error, errorDesc, Lang.queryJS('settings.msftLogin.okButton'))
                setOverlayHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true)
            })
        } else {
            msftLoginLogger.info('Acquired authCode, proceeding with authentication.')

            const authCode = queryMap.code
            AuthManager.addMicrosoftAccount(authCode)
                .then(value => {
                    updateSelectedAccount(value)
                    switchView(getCurrentView(), viewOnClose, 500, 500, async () => {
                        await prepareSettings()
                    })
                })
                .catch(displayableError => {
                    let actualDisplayableError
                    if (isDisplayableError(displayableError)) {
                        msftLoginLogger.error('Error while logging in.', displayableError)
                        actualDisplayableError = displayableError
                    } else {
                        // Uh oh.
                        msftLoginLogger.error('Unhandled error during login.', displayableError)
                        actualDisplayableError = Lang.queryJS('login.error.unknown')
                    }

                    switchView(getCurrentView(), viewOnClose, 500, 500, () => {
                        setOverlayContent(
                            actualDisplayableError.title,
                            actualDisplayableError.desc,
                            Lang.queryJS('login.tryAgain')
                        )
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        toggleOverlay(true)
                    })
                })
        }
    }
})

/**
 * Bind functionality for the account selection buttons. If another account
 * is selected, the UI of the previously selected account will be updated.
 */
function bindAuthAccountSelect() {
    Array.from(document.getElementsByClassName('settingsAuthAccountSelect')).map(val => {
        val.onclick = e => {
            if (val.hasAttribute('selected')) {
                return
            }
            const selectBtns = document.getElementsByClassName('settingsAuthAccountSelect')
            for (let i = 0; i < selectBtns.length; i++) {
                if (selectBtns[i].hasAttribute('selected')) {
                    selectBtns[i].removeAttribute('selected')
                    selectBtns[i].innerHTML = Lang.queryJS('settings.authAccountSelect.selectButton')
                }
            }
            val.setAttribute('selected', '')
            val.innerHTML = Lang.queryJS('settings.authAccountSelect.selectedButton')
            setSelectedAccount(val.closest('.settingsAuthAccount').getAttribute('uuid'))
        }
    })
}

/**
 * Bind functionality for the log out button. If the logged out account was
 * the selected account, another account will be selected and the UI will
 * be updated accordingly.
 */
function bindAuthAccountLogOut() {
    Array.from(document.getElementsByClassName('settingsAuthAccountLogOut')).map(val => {
        val.onclick = e => {
            let isLastAccount = false
            if (Object.keys(ConfigManager.getAuthAccounts()).length === 1) {
                isLastAccount = true
                setOverlayContent(
                    Lang.queryJS('settings.authAccountLogout.lastAccountWarningTitle'),
                    Lang.queryJS('settings.authAccountLogout.lastAccountWarningMessage'),
                    Lang.queryJS('settings.authAccountLogout.confirmButton'),
                    Lang.queryJS('settings.authAccountLogout.cancelButton')
                )
                setOverlayHandler(() => {
                    processLogOut(val, isLastAccount)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true, true)
            } else {
                processLogOut(val, isLastAccount)
            }
        }
    })
}

let msAccDomElementCache
/**
 * Process a log out.
 *
 * @param {Element} val The log out button element.
 * @param {boolean} isLastAccount If this logout is on the last added account.
 */
function processLogOut(val, isLastAccount) {
    const parent = val.closest('.settingsAuthAccount')
    const uuid = parent.getAttribute('uuid')
    const prevSelAcc = ConfigManager.getSelectedAccount()
    const targetAcc = ConfigManager.getAuthAccount(uuid)
    if (targetAcc.type === 'microsoft') {
        msAccDomElementCache = parent
        switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
            ipcRenderer.send(MSFT_OPCODE.OPEN_LOGOUT, uuid, isLastAccount)
        })
    } else {
        AuthManager.removeMojangAccount(uuid).then(() => {
            if (!isLastAccount && uuid === prevSelAcc.uuid) {
                const selAcc = ConfigManager.getSelectedAccount()
                refreshAuthAccountSelected(selAcc.uuid)
                updateSelectedAccount(selAcc)
                validateSelectedAccount()
            }
            if (isLastAccount) {
                loginOptionsCancelEnabled(false)
                loginOptionsViewOnLoginSuccess = VIEWS.settings
                loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                switchView(getCurrentView(), VIEWS.loginOptions)
            }
        })
        $(parent).fadeOut(250, () => {
            parent.remove()
        })
    }
}

// Bind reply for Microsoft Logout.
ipcRenderer.on(MSFT_OPCODE.REPLY_LOGOUT, (_, ...arguments_) => {
    if (arguments_[0] === MSFT_REPLY_TYPE.ERROR) {
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
            if (arguments_.length > 1 && arguments_[1] === MSFT_ERROR.NOT_FINISHED) {
                // User cancelled.
                msftLogoutLogger.info('Logout cancelled by user.')
                return
            }

            // Unexpected error.
            setOverlayContent(
                Lang.queryJS('settings.msftLogout.errorTitle'),
                Lang.queryJS('settings.msftLogout.errorMessage'),
                Lang.queryJS('settings.msftLogout.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
    } else if (arguments_[0] === MSFT_REPLY_TYPE.SUCCESS) {
        const uuid = arguments_[1]
        const isLastAccount = arguments_[2]
        const prevSelAcc = ConfigManager.getSelectedAccount()

        msftLogoutLogger.info('Logout Successful. uuid:', uuid)

        AuthManager.removeMicrosoftAccount(uuid)
            .then(() => {
                if (!isLastAccount && uuid === prevSelAcc.uuid) {
                    const selAcc = ConfigManager.getSelectedAccount()
                    refreshAuthAccountSelected(selAcc.uuid)
                    updateSelectedAccount(selAcc)
                    validateSelectedAccount()
                }
                if (isLastAccount) {
                    loginOptionsCancelEnabled(false)
                    loginOptionsViewOnLoginSuccess = VIEWS.settings
                    loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                    switchView(getCurrentView(), VIEWS.loginOptions)
                }
                if (msAccDomElementCache) {
                    msAccDomElementCache.remove()
                    msAccDomElementCache = null
                }
            })
            .finally(() => {
                if (!isLastAccount) {
                    switchView(getCurrentView(), VIEWS.settings, 500, 500)
                }
            })
    }
})

/**
 * Refreshes the status of the selected account on the auth account
 * elements.
 *
 * @param {string} uuid The UUID of the new selected account.
 */
function refreshAuthAccountSelected(uuid) {
    Array.from(document.getElementsByClassName('settingsAuthAccount')).map(val => {
        const selBtn = val.getElementsByClassName('settingsAuthAccountSelect')[0]
        if (uuid === val.getAttribute('uuid')) {
            selBtn.setAttribute('selected', '')
            selBtn.innerHTML = Lang.queryJS('settings.authAccountSelect.selectedButton')
        } else {
            if (selBtn.hasAttribute('selected')) {
                selBtn.removeAttribute('selected')
            }
            selBtn.innerHTML = Lang.queryJS('settings.authAccountSelect.selectButton')
        }
    })
}

const settingsCurrentMicrosoftAccounts = document.getElementById('settingsCurrentMicrosoftAccounts')
const settingsCurrentMojangAccounts = document.getElementById('settingsCurrentMojangAccounts')

/**
 * Add auth account elements for each one stored in the authentication database.
 */
// prettier-ignore
function populateAuthAccounts(){
    const authAccounts = ConfigManager.getAuthAccounts()
    const authKeys = Object.keys(authAccounts)
    if(authKeys.length === 0){
        return
    }
    const selectedUUID = ConfigManager.getSelectedAccount().uuid

    let microsoftAuthAccountStr = ''
    let mojangAuthAccountStr = ''

    authKeys.forEach((val) => {
        const acc = authAccounts[val]

        const accHtml = `<div class="settingsAuthAccount" uuid="${acc.uuid}">
            <div class="settingsAuthAccountLeft">
                <img class="settingsAuthAccountImage" alt="${acc.displayName}" src="https://mc-heads.net/body/${acc.uuid}/60">
            </div>
            <div class="settingsAuthAccountRight">
                <div class="settingsAuthAccountDetails">
                    <div class="settingsAuthAccountDetailPane">
                        <div class="settingsAuthAccountDetailTitle">${Lang.queryJS('settings.authAccountPopulate.username')}</div>
                        <div class="settingsAuthAccountDetailValue">${acc.displayName}</div>
                    </div>
                    <div class="settingsAuthAccountDetailPane">
                        <div class="settingsAuthAccountDetailTitle">${Lang.queryJS('settings.authAccountPopulate.uuid')}</div>
                        <div class="settingsAuthAccountDetailValue">${acc.uuid}</div>
                    </div>
                </div>
                <div class="settingsAuthAccountActions">
                    <button class="settingsAuthAccountSelect" ${selectedUUID === acc.uuid ? 'selected>' + Lang.queryJS('settings.authAccountPopulate.selectedAccount') : '>' + Lang.queryJS('settings.authAccountPopulate.selectAccount')}</button>
                    <div class="settingsAuthAccountWrapper">
                        <button class="settingsAuthAccountLogOut">${Lang.queryJS('settings.authAccountPopulate.logout')}</button>
                    </div>
                </div>
            </div>
        </div>`

        if(acc.type === 'microsoft') {
            microsoftAuthAccountStr += accHtml
        } else {
            mojangAuthAccountStr += accHtml
        }

    })

    settingsCurrentMicrosoftAccounts.innerHTML = microsoftAuthAccountStr
    settingsCurrentMojangAccounts.innerHTML = mojangAuthAccountStr
}

/**
 * Prepare the accounts tab for display.
 */
function prepareAccountsTab() {
    populateAuthAccounts()
    bindAuthAccountSelect()
    bindAuthAccountLogOut()
}

/**
 * Minecraft Tab
 */

/**
 * Disable decimals, negative signs, and scientific notation.
 */
document.getElementById('settingsGameWidth').addEventListener('keydown', e => {
    if (/^[-.eE]$/.test(e.key)) {
        e.preventDefault()
    }
})
document.getElementById('settingsGameHeight').addEventListener('keydown', e => {
    if (/^[-.eE]$/.test(e.key)) {
        e.preventDefault()
    }
})

/**
 * Mods Tab
 */

const settingsModsContainer = document.getElementById('settingsModsContainer')

/**
 * Resolve and update the mods on the UI.
 */
async function resolveModsForUI() {
    const serv = ConfigManager.getSelectedServer()

    const distro = await DistroAPI.getDistribution()
    const servConf = ConfigManager.getModConfiguration(serv)

    const modStr = parseModulesForUI(distro.getServerById(serv).modules, false, servConf.mods)

    document.getElementById('settingsReqModsContent').innerHTML = modStr.reqMods
    document.getElementById('settingsOptModsContent').innerHTML = modStr.optMods
}

/**
 * Recursively build the mod UI elements.
 *
 * @param {Object[]} mdls An array of modules to parse.
 * @param {boolean} submodules Whether or not we are parsing submodules.
 * @param {Object} servConf The server configuration object for this module level.
 */
// prettier-ignore
function parseModulesForUI(mdls, submodules, servConf) {
    let reqMods = ''
    let optMods = ''

    for (const mdl of mdls) {
        if (
            mdl.rawModule.type === Type.ForgeMod ||
            mdl.rawModule.type === Type.LiteMod ||
            mdl.rawModule.type === Type.LiteLoader ||
            mdl.rawModule.type === Type.FabricMod
        ) {
            if (mdl.getRequired().value) {
                reqMods += `<div id="${mdl.getVersionlessMavenIdentifier()}" class="settingsBaseMod settings${
                    submodules ? 'Sub' : ''
                }Mod" enabled>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${mdl.rawModule.name}</span>
                                <span class="settingsModVersion">v${mdl.mavenComponents.version}</span>
                            </div>
                        </div>
                        <label class="toggleSwitch" reqmod>
                            <input type="checkbox" checked>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                    ${mdl.subModules.length > 0 ? `<div class="settingsSubModContainer">
                        ${Object.values(parseModulesForUI(mdl.subModules, true, servConf[mdl.getVersionlessMavenIdentifier()])).join('')}
                    </div>` : ''}
                </div>`

            } else {

                const conf = servConf[mdl.getVersionlessMavenIdentifier()]
                const val = typeof conf === 'object' ? conf.value : conf

                optMods += `<div id="${mdl.getVersionlessMavenIdentifier()}" class="settingsBaseMod settings${
                    submodules ? 'Sub' : ''
                }Mod" ${val ? 'enabled' : ''}>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${mdl.rawModule.name}</span>
                                <span class="settingsModVersion">v${mdl.mavenComponents.version}</span>
                            </div>
                        </div>
                        <label class="toggleSwitch">
                            <input type="checkbox" formod="${mdl.getVersionlessMavenIdentifier()}" ${val ? 'checked' : ''}>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                    ${mdl.subModules.length > 0 ? `<div class="settingsSubModContainer">
                        ${Object.values(parseModulesForUI(mdl.subModules, true, conf.mods)).join('')}
                    </div>` : ''}
                </div>`

            }
        }
    }

    return {
        reqMods,
        optMods
    }

}

/**
 * Bind functionality to mod config toggle switches. Switching the value
 * will also switch the status color on the left of the mod UI.
 */
function bindModsToggleSwitch() {
    const sEls = settingsModsContainer.querySelectorAll('[formod]')
    Array.from(sEls).map((v, index, arr) => {
        v.onchange = () => {
            if (v.checked) {
                document.getElementById(v.getAttribute('formod')).setAttribute('enabled', '')
            } else {
                document.getElementById(v.getAttribute('formod')).removeAttribute('enabled')
            }
        }
    })
}

/**
 * Save the mod configuration based on the UI values.
 */
function saveModConfiguration() {
    const serv = ConfigManager.getSelectedServer()
    const modConf = ConfigManager.getModConfiguration(serv)
    modConf.mods = _saveModConfiguration(modConf.mods)
    ConfigManager.setModConfiguration(serv, modConf)
}

/**
 * Recursively save mod config with submods.
 *
 * @param {Object} modConf Mod config object to save.
 */
function _saveModConfiguration(modConf) {
    for (let m of Object.entries(modConf)) {
        const tSwitch = settingsModsContainer.querySelectorAll(`[formod='${m[0]}']`)
        if (!tSwitch[0].hasAttribute('dropin')) {
            if (typeof m[1] === 'boolean') {
                modConf[m[0]] = tSwitch[0].checked
            } else {
                if (m[1] != null) {
                    if (tSwitch.length > 0) {
                        modConf[m[0]].value = tSwitch[0].checked
                    }
                    modConf[m[0]].mods = _saveModConfiguration(modConf[m[0]].mods)
                }
            }
        }
    }
    return modConf
}

// Drop-in mod elements.

let CACHE_SETTINGS_MODS_DIR
let CACHE_DROPIN_MODS

/**
 * Resolve any located drop-in mods for this server and
 * populate the results onto the UI.
 */
// prettier-ignore
async function resolveDropinModsForUI(){
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    CACHE_SETTINGS_MODS_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id, 'mods')
    CACHE_DROPIN_MODS = DropinModUtil.scanForDropinMods(CACHE_SETTINGS_MODS_DIR, serv.rawServer.minecraftVersion)

    let dropinMods = ''

    for (dropin of CACHE_DROPIN_MODS) {
        dropinMods += `<div id="${dropin.fullName}" class="settingsBaseMod settingsDropinMod" ${
            !dropin.disabled ? 'enabled' : ''
        }>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${dropin.name}</span>
                                <div class="settingsDropinRemoveWrapper">
                                    <button class="settingsDropinRemoveButton" remmod="${dropin.fullName}">${Lang.queryJS('settings.dropinMods.removeButton')}</button>
                                </div>
                            </div>
                        </div>
                        <label class="toggleSwitch">
                            <input type="checkbox" formod="${dropin.fullName}" dropin ${!dropin.disabled ? 'checked' : ''}>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                </div>`
    }

    document.getElementById('settingsDropinModsContent').innerHTML = dropinMods
}

/**
 * Bind the remove button for each loaded drop-in mod.
 */
function bindDropinModsRemoveButton() {
    const sEls = settingsModsContainer.querySelectorAll('[remmod]')
    Array.from(sEls).map((v, index, arr) => {
        v.onclick = async () => {
            const fullName = v.getAttribute('remmod')
            const res = await DropinModUtil.deleteDropinMod(CACHE_SETTINGS_MODS_DIR, fullName)
            if (res) {
                document.getElementById(fullName).remove()
            } else {
                setOverlayContent(
                    Lang.queryJS('settings.dropinMods.deleteFailedTitle', { fullName }),
                    Lang.queryJS('settings.dropinMods.deleteFailedMessage'),
                    Lang.queryJS('settings.dropinMods.okButton')
                )
                setOverlayHandler(null)
                toggleOverlay(true)
            }
        }
    })
}

/**
 * Bind functionality to the file system button for the selected
 * server configuration.
 */
function bindDropinModFileSystemButton() {
    const fsBtn = document.getElementById('settingsDropinFileSystemButton')
    fsBtn.onclick = () => {
        /* DropinModUtil.validateDir(CACHE_SETTINGS_MODS_DIR) */
        shell.openPath(CACHE_SETTINGS_MODS_DIR)
    }
    fsBtn.ondragenter = e => {
        e.dataTransfer.dropEffect = 'move'
        fsBtn.setAttribute('drag', '')
        e.preventDefault()
    }
    fsBtn.ondragover = e => {
        e.preventDefault()
    }
    fsBtn.ondragleave = e => {
        fsBtn.removeAttribute('drag')
    }

    fsBtn.ondrop = async e => {
        fsBtn.removeAttribute('drag')
        e.preventDefault()

        DropinModUtil.addDropinMods(e.dataTransfer.files, CACHE_SETTINGS_MODS_DIR)
        await reloadDropinMods()
    }
}

/**
 * Save drop-in mod states. Enabling and disabling is just a matter
 * of adding/removing the .disabled extension.
 */
function saveDropinModConfiguration() {
    for (dropin of CACHE_DROPIN_MODS) {
        const dropinUI = document.getElementById(dropin.fullName)
        if (dropinUI != null) {
            const dropinUIEnabled = dropinUI.hasAttribute('enabled')
            if (DropinModUtil.isDropinModEnabled(dropin.fullName) != dropinUIEnabled) {
                DropinModUtil.toggleDropinMod(CACHE_SETTINGS_MODS_DIR, dropin.fullName, dropinUIEnabled).catch(err => {
                    if (!isOverlayVisible()) {
                        setOverlayContent(
                            Lang.queryJS('settings.dropinMods.failedToggleTitle'),
                            err.message,
                            Lang.queryJS('settings.dropinMods.okButton')
                        )
                        setOverlayHandler(null)
                        toggleOverlay(true)
                    }
                })
            }
        }
    }
}

// Refresh the drop-in mods when F5 is pressed.
// Only active on the mods tab.
document.addEventListener('keydown', async e => {
    if (getCurrentView() === VIEWS.settings && selectedSettingsTab === 'settingsTabMods') {
        if (e.key === 'F5') {
            await reloadDropinMods()
            saveShaderpackSettings()
            await resolveShaderpacksForUI()
        }
    }
})

async function reloadDropinMods() {
    await resolveDropinModsForUI()
    bindDropinModsRemoveButton()
    bindDropinModFileSystemButton()
    bindModsToggleSwitch()
}

// Shaderpack

let CACHE_SETTINGS_INSTANCE_DIR
let CACHE_SHADERPACKS
let CACHE_SELECTED_SHADERPACK

/**
 * Load shaderpack information.
 */
async function resolveShaderpacksForUI() {
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    CACHE_SETTINGS_INSTANCE_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id)
    CACHE_SHADERPACKS = DropinModUtil.scanForShaderpacks(CACHE_SETTINGS_INSTANCE_DIR)
    CACHE_SELECTED_SHADERPACK = DropinModUtil.getEnabledShaderpack(CACHE_SETTINGS_INSTANCE_DIR)

    setShadersOptions(CACHE_SHADERPACKS, CACHE_SELECTED_SHADERPACK)
}

function setShadersOptions(arr, selected) {
    const cont = document.getElementById('settingsShadersOptions')
    cont.innerHTML = ''
    for (let opt of arr) {
        const d = document.createElement('DIV')
        d.innerHTML = opt.name
        d.setAttribute('value', opt.fullName)
        if (opt.fullName === selected) {
            d.setAttribute('selected', '')
            document.getElementById('settingsShadersSelected').innerHTML = opt.name
        }
        d.addEventListener('click', function (e) {
            this.parentNode.previousElementSibling.innerHTML = this.innerHTML
            for (let sib of this.parentNode.children) {
                sib.removeAttribute('selected')
            }
            this.setAttribute('selected', '')
            closeSettingsSelect()
        })
        cont.appendChild(d)
    }
}

function saveShaderpackSettings() {
    let sel = 'OFF'
    for (let opt of document.getElementById('settingsShadersOptions').childNodes) {
        if (opt.hasAttribute('selected')) {
            sel = opt.getAttribute('value')
        }
    }
    DropinModUtil.setEnabledShaderpack(CACHE_SETTINGS_INSTANCE_DIR, sel)
}

function bindShaderpackButton() {
    const spBtn = document.getElementById('settingsShaderpackButton')
    spBtn.onclick = () => {
        const p = path.join(CACHE_SETTINGS_INSTANCE_DIR, 'shaderpacks')
        DropinModUtil.validateDir(p)
        shell.openPath(p)
    }
    spBtn.ondragenter = e => {
        e.dataTransfer.dropEffect = 'move'
        spBtn.setAttribute('drag', '')
        e.preventDefault()
    }
    spBtn.ondragover = e => {
        e.preventDefault()
    }
    spBtn.ondragleave = e => {
        spBtn.removeAttribute('drag')
    }

    spBtn.ondrop = async e => {
        spBtn.removeAttribute('drag')
        e.preventDefault()

        DropinModUtil.addShaderpacks(e.dataTransfer.files, CACHE_SETTINGS_INSTANCE_DIR)
        saveShaderpackSettings()
        await resolveShaderpacksForUI()
    }
}

// Server status bar functions.

/**
 * Load the currently selected server information onto the mods tab.
 */
// prettier-ignore
async function loadSelectedServerOnModsTab() {
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    for (const el of document.getElementsByClassName('settingsSelServContent')) {
        el.innerHTML = `
            <img class="serverListingImg" src="${serv.rawServer.icon}"/>
            <div class="serverListingDetails">
                <span class="serverListingName">${serv.rawServer.name}</span>
                <span class="serverListingDescription">${serv.rawServer.description}</span>
                <div class="serverListingInfo">
                    <div class="serverListingVersion">${serv.rawServer.minecraftVersion}</div>
                    <div class="serverListingRevision">${serv.rawServer.version}</div>
                    ${serv.rawServer.mainServer ? `<div class="serverListingStarWrapper">
                        <svg id="Layer_1" viewBox="0 0 107.45 104.74" width="20px" height="20px">
                            <defs>
                                <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-miterlimit:10;}</style>
                            </defs>
                            <path class="cls-1" d="M100.93,65.54C89,62,68.18,55.65,63.54,52.13c2.7-5.23,18.8-19.2,28-27.55C81.36,31.74,63.74,43.87,58.09,45.3c-2.41-5.37-3.61-26.52-4.37-39-.77,12.46-2,33.64-4.36,39-5.7-1.46-23.3-13.57-33.49-20.72,9.26,8.37,25.39,22.36,28,27.55C39.21,55.68,18.47,62,6.52,65.55c12.32-2,33.63-6.06,39.34-4.9-.16,5.87-8.41,26.16-13.11,37.69,6.1-10.89,16.52-30.16,21-33.9,4.5,3.79,14.93,23.09,21,34C70,86.84,61.73,66.48,61.59,60.65,67.36,59.49,88.64,63.52,100.93,65.54Z"/>
                            <circle class="cls-2" cx="53.73" cy="53.9" r="38"/>
                        </svg>
                        <span class="serverListingStarTooltip">${Lang.queryJS('settings.serverListing.mainServer')}</span>
                    </div>` : ''}
                </div>
            </div>
        `
    }
}

// Bind functionality to the server switch button.
Array.from(document.getElementsByClassName('settingsSwitchServerButton')).forEach(el => {
    el.addEventListener('click', async e => {
        e.target.blur()
        await toggleServerSelection(true)
    })
})

/**
 * Save mod configuration for the current selected server.
 */
function saveAllModConfigurations() {
    saveModConfiguration()
    ConfigManager.save()
    saveDropinModConfiguration()
}

/**
 * Function to refresh the current tab whenever the selected
 * server is changed.
 */
function animateSettingsTabRefresh() {
    $(`#${selectedSettingsTab}`).fadeOut(500, async () => {
        await prepareSettings()
        $(`#${selectedSettingsTab}`).fadeIn(500)
    })
}

/**
 * Prepare the Mods tab for display.
 */
async function prepareModsTab(first) {
    await resolveModsForUI()
    await resolveDropinModsForUI()
    await resolveShaderpacksForUI()
    bindDropinModsRemoveButton()
    bindDropinModFileSystemButton()
    bindShaderpackButton()
    bindModsToggleSwitch()
    await loadSelectedServerOnModsTab()
}

/**
 * Java Tab
 */

// DOM Cache
const settingsMaxRAMRange = document.getElementById('settingsMaxRAMRange')
const settingsMinRAMRange = document.getElementById('settingsMinRAMRange')
const settingsMaxRAMLabel = document.getElementById('settingsMaxRAMLabel')
const settingsMinRAMLabel = document.getElementById('settingsMinRAMLabel')
const settingsMemoryTotal = document.getElementById('settingsMemoryTotal')
const settingsMemoryAvail = document.getElementById('settingsMemoryAvail')
const settingsMemoryUsed = document.getElementById('settingsMemoryUsed')
const settingsJavaExecDetails = document.getElementById('settingsJavaExecDetails')
const settingsJavaReqDesc = document.getElementById('settingsJavaReqDesc')
const settingsJvmOptsLink = document.getElementById('settingsJvmOptsLink')

// Create input fields for RAM values
function createRAMInputFields() {
    // Check if the input fields already exist to prevent duplicates
    if (document.getElementById('settingsMaxRAMInput') || document.getElementById('settingsMinRAMInput')) {
        return // Fields already exist, no need to create them again
    }

    // Get total memory
    const totalRAM = Number(os.totalmem() / 1073741824).toFixed(1)

    // Replace settingsMaxRAMLabel with input field
    const maxRAMLabel = settingsMaxRAMLabel
    const maxRAMText = maxRAMLabel.textContent

    // Create max RAM input field
    const maxRAMInput = document.createElement('input')
    maxRAMInput.id = 'settingsMaxRAMInput'
    maxRAMInput.type = 'number'
    maxRAMInput.min = settingsMaxRAMRange.getAttribute('min')
    maxRAMInput.max = Math.min(settingsMaxRAMRange.getAttribute('max'), totalRAM)
    maxRAMInput.step = '0.1'
    maxRAMInput.value = parseFloat(maxRAMText)
    maxRAMInput.style.width = '60px'
    maxRAMInput.className = 'settingsMemoryLabel'

    // Replace label with input
    maxRAMLabel.innerHTML = ''
    maxRAMLabel.appendChild(maxRAMInput)

    // Replace settingsMinRAMLabel with input field
    const minRAMLabel = settingsMinRAMLabel
    const minRAMText = minRAMLabel.textContent

    // Create min RAM input field
    const minRAMInput = document.createElement('input')
    minRAMInput.id = 'settingsMinRAMInput'
    minRAMInput.type = 'number'
    minRAMInput.min = settingsMinRAMRange.getAttribute('min')
    minRAMInput.max = Math.min(settingsMinRAMRange.getAttribute('max'), totalRAM)
    minRAMInput.step = '0.1'
    minRAMInput.value = parseFloat(minRAMText)
    minRAMInput.style.width = '60px'
    minRAMInput.className = 'settingsMemoryLabel'

    // Replace label with input
    minRAMLabel.innerHTML = ''
    minRAMLabel.appendChild(minRAMInput)

    // Bind input events
    maxRAMInput.addEventListener('change', e => {
        const value = parseFloat(e.target.value)
        if (isNaN(value)) return

        // Ensure value doesn't exceed total RAM
        const totalRAM = Number(os.totalmem() / 1073741824)
        const cappedValue = Math.min(value, totalRAM)
        e.target.value = cappedValue.toFixed(1)

        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        const notch = ((cappedValue - sliderMeta.min) / sliderMeta.step) * sliderMeta.inc
        updateRangedSlider(settingsMaxRAMRange, cappedValue, notch)
    })

    minRAMInput.addEventListener('change', e => {
        const value = parseFloat(e.target.value)
        if (isNaN(value)) return

        // Ensure value doesn't exceed total RAM
        const totalRAM = Number(os.totalmem() / 1073741824)
        const cappedValue = Math.min(value, totalRAM)
        e.target.value = cappedValue.toFixed(1)

        const sliderMeta = calculateRangeSliderMeta(settingsMinRAMRange)
        const notch = ((cappedValue - sliderMeta.min) / sliderMeta.step) * sliderMeta.inc
        updateRangedSlider(settingsMinRAMRange, cappedValue, notch)
    })
}

/**
 * Calculate common values for a ranged slider.
 *
 * @param {Element} v The range slider to calculate against.
 * @returns {Object} An object with meta values for the provided ranged slider.
 */
function calculateRangeSliderMeta(v) {
    const val = {
        max: Number(v.getAttribute('max')),
        min: Number(v.getAttribute('min')),
        step: Number(v.getAttribute('step')),
    }
    val.ticks = (val.max - val.min) / val.step
    val.inc = 100 / val.ticks
    return val
}

/**
 * Binds functionality to the ranged sliders. They're more than
 * just divs now :').
 */
function bindRangeSlider() {
    Array.from(document.getElementsByClassName('rangeSlider')).map(v => {
        // Reference the track (thumb).
        const track = v.getElementsByClassName('rangeSliderTrack')[0]
        const bar = v.getElementsByClassName('rangeSliderBar')[0]

        // Set the initial slider value.
        const value = v.getAttribute('value')
        const sliderMeta = calculateRangeSliderMeta(v)

        updateRangedSlider(v, value, ((value - sliderMeta.min) / sliderMeta.step) * sliderMeta.inc)

        // Make the entire slider clickable
        v.onclick = e => {
            // Ignore clicks on the track itself to prevent double handling
            if (e.target === track) {
                return
            }

            // Calculate the click position relative to the slider width
            const clickX = e.pageX - v.getBoundingClientRect().left
            const sliderWidth = v.offsetWidth

            // Calculate the exact value based on position
            const percentage = Math.min(Math.max(clickX / sliderWidth, 0), 1)
            const exactValue = sliderMeta.min + percentage * (sliderMeta.max - sliderMeta.min)

            // Round to the nearest step increment
            const steppedValue = Math.round(exactValue / sliderMeta.step) * sliderMeta.step
            const cappedValue = Math.min(Math.max(steppedValue, sliderMeta.min), sliderMeta.max)

            // Calculate the notch percentage
            const notchPercentage = ((cappedValue - sliderMeta.min) / (sliderMeta.max - sliderMeta.min)) * 100

            // Update slider value
            updateRangedSlider(v, cappedValue, notchPercentage)
        }

        // The magic happens when we click on the track.
        track.onmousedown = e => {
            e.stopPropagation() // Prevent triggering the parent's click event

            // Get current slider rect
            const sliderRect = v.getBoundingClientRect()

            // Initial positioning
            const initialMouseX = e.clientX
            const initialTrackLeft = parseFloat(track.style.left || '0')

            // Update track position for smoother drag
            function updateTrackPosition(moveEvent) {
                // Calculate the new position
                const deltaX = moveEvent.clientX - initialMouseX
                const sliderWidth = sliderRect.width

                // Calculate the percentage move and add to initial position
                const percentage = (deltaX / sliderWidth) * 100
                let newPercentage = initialTrackLeft + percentage

                // Clamp the percentage between 0 and 100
                newPercentage = Math.min(Math.max(newPercentage, 0), 100)

                // Calculate exact value based on percentage
                const exactValue = sliderMeta.min + (newPercentage / 100) * (sliderMeta.max - sliderMeta.min)

                // Round to the nearest step increment
                const steppedValue = Math.round(exactValue / sliderMeta.step) * sliderMeta.step
                const cappedValue = Math.min(Math.max(steppedValue, sliderMeta.min), sliderMeta.max)

                // Calculate the notch percentage
                const notchPercentage = ((cappedValue - sliderMeta.min) / (sliderMeta.max - sliderMeta.min)) * 100

                // Update the slider value
                updateRangedSlider(v, cappedValue, notchPercentage)
            }

            // Update on mouse move
            function handleMouseMove(moveEvent) {
                moveEvent.preventDefault()
                updateTrackPosition(moveEvent)
            }

            // Stop dragging on mouse up
            function handleMouseUp() {
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
            }

            // Add event listeners for dragging
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        }
    })
}

/**
 * Update a ranged slider's value and position.
 *
 * @param {Element} element The ranged slider to update.
 * @param {string | number} value The new value for the ranged slider.
 * @param {number} percentage The percentage position for the slider (0-100).
 */
function updateRangedSlider(element, value, percentage) {
    const oldVal = element.getAttribute('value')
    const bar = element.getElementsByClassName('rangeSliderBar')[0]
    const track = element.getElementsByClassName('rangeSliderTrack')[0]

    // Set the precise value
    element.setAttribute('value', value)

    // Make sure percentage is within bounds
    percentage = Math.min(Math.max(percentage, 0), 100)

    const event = new MouseEvent('change', {
        target: element,
        type: 'change',
        bubbles: false,
        cancelable: true,
    })

    let cancelled = !element.dispatchEvent(event)

    if (!cancelled) {
        // Update position with exact values
        track.style.left = percentage + '%'
        bar.style.width = percentage + '%'
    } else {
        element.setAttribute('value', oldVal)
    }
}

// Bind on change event for min memory container.
settingsMinRAMRange.onchange = e => {
    // Current range values
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))

    // Get total RAM
    const totalRAM = Number(os.totalmem() / 1073741824)

    // Cap the value to total RAM
    const cappedValue = Math.min(sMinV, totalRAM)

    // If value was capped, update the slider
    if (cappedValue !== sMinV) {
        const sliderMeta = calculateRangeSliderMeta(settingsMinRAMRange)
        const notch = ((cappedValue - sliderMeta.min) / sliderMeta.step) * sliderMeta.inc
        updateRangedSlider(settingsMinRAMRange, cappedValue, notch)
        // After capping, return since updateRangedSlider will trigger this function again
        return
    }

    // Get reference to range bar.
    const bar = e.target.getElementsByClassName('rangeSliderBar')[0]
    // Calculate effective total memory.
    const max = os.totalmem() / 1073741824

    // Change range bar color based on the selected value.
    if (sMinV >= max / 2) {
        bar.style.background = '#e86060'
    } else if (sMinV >= max / 4) {
        bar.style.background = '#e8e18b'
    } else {
        bar.style.background = null
    }

    // Increase maximum memory if the minimum exceeds its value.
    if (sMaxV < sMinV) {
        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        updateRangedSlider(settingsMaxRAMRange, sMinV, ((sMinV - sliderMeta.min) / sliderMeta.step) * sliderMeta.inc)

        // Update max RAM input field
        const maxRAMInput = document.getElementById('settingsMaxRAMInput')
        if (maxRAMInput) maxRAMInput.value = sMinV.toFixed(1)
    }

    // Update min RAM input field
    const minRAMInput = document.getElementById('settingsMinRAMInput')
    if (minRAMInput) minRAMInput.value = sMinV.toFixed(1)

    // Update Remaining Memory
    updateUsedMemory(sMinV, sMaxV)
}

// Bind on change event for max memory container.
settingsMaxRAMRange.onchange = e => {
    // Current range values
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))

    // Get total RAM
    const totalRAM = Number(os.totalmem() / 1073741824)

    // Cap the value to total RAM
    const cappedValue = Math.min(sMaxV, totalRAM)

    // If value was capped, update the slider
    if (cappedValue !== sMaxV) {
        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        const notch = ((cappedValue - sliderMeta.min) / sliderMeta.step) * sliderMeta.inc
        updateRangedSlider(settingsMaxRAMRange, cappedValue, notch)
        // After capping, return since updateRangedSlider will trigger this function again
        return
    }

    // Get reference to range bar.
    const bar = e.target.getElementsByClassName('rangeSliderBar')[0]
    // Calculate effective total memory.
    const max = os.totalmem() / 1073741824

    // Change range bar color based on the selected value.
    if (sMaxV >= max / 2) {
        bar.style.background = '#e86060'
    } else if (sMaxV >= max / 4) {
        bar.style.background = '#e8e18b'
    } else {
        bar.style.background = null
    }

    // Decrease the minimum memory if the maximum value is less.
    if (sMaxV < sMinV) {
        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        updateRangedSlider(settingsMinRAMRange, sMaxV, ((sMaxV - sliderMeta.min) / sliderMeta.step) * sliderMeta.inc)

        // Update min RAM input field
        const minRAMInput = document.getElementById('settingsMinRAMInput')
        if (minRAMInput) minRAMInput.value = sMaxV.toFixed(1)
    }

    // Update max RAM input field
    const maxRAMInput = document.getElementById('settingsMaxRAMInput')
    if (maxRAMInput) maxRAMInput.value = sMaxV.toFixed(1)

    // Update Remaining Memory
    updateUsedMemory(sMinV, sMaxV)
}

/**
 * Update the Remaining Memory display based on current min and max RAM values
 *
 * @param {number} minRAM The minimum RAM value
 * @param {number} maxRAM The maximum RAM value
 */
function updateUsedMemory(minRAM, maxRAM) {
    if (settingsMemoryUsed != null) {
        const totalRAM = Number(os.totalmem() / 1073741824)
        // Calculate how much will be left after allocating maxRAM
        const remainingRAM = Math.max(0, totalRAM - maxRAM).toFixed(1)
        settingsMemoryUsed.innerHTML = remainingRAM + 'G'
    }
}

/**
 * Display the total and available RAM.
 */
function populateMemoryStatus() {
    const totalRAM = Number((os.totalmem() - 1073741824) / 1073741824).toFixed(1)
    const availableRAM = Number(os.freemem() / 1073741824).toFixed(1)

    settingsMemoryTotal.innerHTML = totalRAM + 'G'
    settingsMemoryAvail.innerHTML = availableRAM + 'G'

    // Initialize the Used memory display
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))
    updateUsedMemory(sMinV, sMaxV)
}

function bindMinMaxRam(server) {
    // Store maximum memory values.
    const SETTINGS_MAX_MEMORY = ConfigManager.getAbsoluteMaxRAM(server.rawServer.javaOptions?.ram)
    const SETTINGS_MIN_MEMORY = ConfigManager.getAbsoluteMinRAM(server.rawServer.javaOptions?.ram)

    // Use the total system RAM as the maximum value instead of the calculated limit
    const totalRAM = Number(os.totalmem() / 1073741824)
    const cappedMaxMemory = Math.floor(totalRAM)

    // Set the max and min values for the ranged sliders.
    settingsMaxRAMRange.setAttribute('max', cappedMaxMemory)
    settingsMaxRAMRange.setAttribute('min', SETTINGS_MIN_MEMORY)
    settingsMinRAMRange.setAttribute('max', cappedMaxMemory)
    settingsMinRAMRange.setAttribute('min', SETTINGS_MIN_MEMORY)
}

/**
 * Prepare the Java tab for display.
 */
async function prepareJavaTab() {
    const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    bindMinMaxRam(server)
    bindRangeSlider(server)
    createRAMInputFields() // Add input fields for RAM values
    populateMemoryStatus()
    populateJavaReqDesc(server)
    populateJvmOptsLink(server)
}

/**
 * About Tab
 */

const settingsTabAbout = document.getElementById('settingsTabAbout')
const settingsAboutChangelogTitle = settingsTabAbout.getElementsByClassName('settingsChangelogTitle')[0]
const settingsAboutChangelogText = settingsTabAbout.getElementsByClassName('settingsChangelogText')[0]
const settingsAboutChangelogButton = settingsTabAbout.getElementsByClassName('settingsChangelogButton')[0]
const settingsAboutMachineIdValue = document.getElementById('settingsAboutMachineIdValue')

// Bind the devtools toggle button.
document.getElementById('settingsAboutDevToolsButton').onclick = e => {
    let window = remote.getCurrentWindow()
    window.toggleDevTools()
}

/**
 * Populate the machine ID value on the About tab.
 */
function populateMachineId() {
    try {
        const { machineIdSync } = require('node-machine-id')
        const id = machineIdSync({ original: true })
        settingsAboutMachineIdValue.textContent = id
    } catch (error) {
        console.error('Error getting machine ID:', error)
        settingsAboutMachineIdValue.textContent = 'Error: Could not retrieve machine ID'
    }
}

/**
 * Return whether or not the provided version is a prerelease.
 *
 * @param {string} version The semver version to test.
 * @returns {boolean} True if the version is a prerelease, otherwise false.
 */
function isPrerelease(version) {
    const preRelComp = semver.prerelease(version)
    return preRelComp != null && preRelComp.length > 0
}

/**
 * Utility method to display version information on the
 * About and Update settings tabs.
 *
 * @param {string} version The semver version to display.
 * @param {Element} valueElement The value element.
 * @param {Element} titleElement The title element.
 * @param {Element} checkElement The check mark element.
 * @param {Element} titleVersionElement The element to display the version in the title.
 */
function populateVersionInformation(version, valueElement, titleElement, checkElement, titleVersionElement) {
    valueElement.innerHTML = version
    titleVersionElement.innerHTML = version
    if (isPrerelease(version)) {
        titleElement.innerHTML = Lang.queryJS('settings.about.preReleaseTitle')
        titleElement.style.color = '#ff886d'
        checkElement.style.background = '#ff886d'
    } else {
        titleElement.innerHTML = Lang.queryJS('settings.about.stableReleaseTitle')
        titleElement.style.color = null
        checkElement.style.background = null
    }
}

/**
 * Retrieve the version information and display it on the UI.
 */
function populateAboutVersionInformation() {
    populateVersionInformation(
        remote.app.getVersion(),
        document.getElementById('settingsAboutCurrentVersionValue'),
        document.getElementById('settingsAboutCurrentVersionTitle'),
        document.getElementById('settingsAboutCurrentVersionCheck'),
        document.getElementById('titleUpdateVersionValue')
    )
}

/**
 * Fetches the GitHub atom release feed and parses it for the release notes
 * of the current version. This value is displayed on the UI.
 */
function populateReleaseNotes() {
    $.ajax({
        url: 'https://github.com/Muspelheim-Hosting/NourLauncher/releases.atom',
        success: data => {
            const version = 'v' + remote.app.getVersion()
            const entries = $(data).find('entry')

            for (let i = 0; i < entries.length; i++) {
                const entry = $(entries[i])
                let id = entry.find('id').text()
                id = id.substring(id.lastIndexOf('/') + 1)

                if (id === version) {
                    settingsAboutChangelogTitle.innerHTML = entry.find('title').text()
                    settingsAboutChangelogText.innerHTML = entry.find('content').text()
                    settingsAboutChangelogButton.href = entry.find('link').attr('href')
                }
            }
        },
        timeout: 2500,
    }).catch(err => {
        settingsAboutChangelogText.innerHTML = Lang.queryJS('settings.about.releaseNotesFailed')
    })
}

/**
 * Prepare account tab for display.
 */
function prepareAboutTab() {
    populateAboutVersionInformation()
    populateReleaseNotes()
    populateMachineId()
}

/**
 * Update Tab
 */

const settingsTabUpdate = document.getElementById('settingsTabUpdate')
const settingsUpdateTitle = document.getElementById('settingsUpdateTitle')
const settingsUpdateVersionCheck = document.getElementById('settingsUpdateVersionCheck')
const settingsUpdateVersionTitle = document.getElementById('settingsUpdateVersionTitle')
const settingsUpdateVersionValue = document.getElementById('settingsUpdateVersionValue')
const titleUpdateVersionValue = document.getElementById('titleUpdateVersionValue')
const settingsUpdateChangelogTitle = settingsTabUpdate.getElementsByClassName('settingsChangelogTitle')[0]
const settingsUpdateChangelogText = settingsTabUpdate.getElementsByClassName('settingsChangelogText')[0]
const settingsUpdateChangelogCont = settingsTabUpdate.getElementsByClassName('settingsChangelogContainer')[0]
const settingsUpdateActionButton = document.getElementById('settingsUpdateActionButton')

/**
 * Update the properties of the update action button.
 *
 * @param {string} text The new button text.
 * @param {boolean} disabled Optional. Disable or enable the button
 * @param {function} handler Optional. New button event handler.
 */
function settingsUpdateButtonStatus(text, disabled = false, handler = null) {
    settingsUpdateActionButton.innerHTML = text
    settingsUpdateActionButton.disabled = disabled
    if (handler != null) {
        settingsUpdateActionButton.onclick = handler
    }
}

/**
 * Populate the update tab with relevant information.
 *
 * @param {Object} data The update data.
 */
function populateSettingsUpdateInformation(data) {
    if (data != null) {
        settingsUpdateTitle.innerHTML = isPrerelease(data.version)
            ? Lang.queryJS('settings.updates.newPreReleaseTitle')
            : Lang.queryJS('settings.updates.newReleaseTitle')
        settingsUpdateChangelogCont.style.display = null
        settingsUpdateChangelogTitle.innerHTML = data.releaseName
        settingsUpdateChangelogText.innerHTML = data.releaseNotes
        populateVersionInformation(
            data.version,
            settingsUpdateVersionValue,
            settingsUpdateVersionTitle,
            settingsUpdateVersionCheck,
            titleUpdateVersionValue
        )

        if (process.platform === 'darwin') {
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadButton'), false, () => {
                shell.openExternal(data.darwindownload)
            })
        } else {
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadingButton'), true)
        }
    } else {
        settingsUpdateTitle.innerHTML = Lang.queryJS('settings.updates.latestVersionTitle')
        settingsUpdateChangelogCont.style.display = 'none'
        populateVersionInformation(
            remote.app.getVersion(),
            settingsUpdateVersionValue,
            settingsUpdateVersionTitle,
            settingsUpdateVersionCheck,
            titleUpdateVersionValue
        )
        settingsUpdateButtonStatus(Lang.queryJS('settings.updates.checkForUpdatesButton'), false, () => {
            ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.checkingForUpdatesButton'), true)
        })
    }
}

/**
 * Prepare update tab for display.
 *
 * @param {Object} data The update data.
 */
function prepareUpdateTab(data = null) {
    populateSettingsUpdateInformation(data)
}

/**
 * Settings preparation functions.
 */

/**
 * Prepare the entire settings UI.
 *
 * @param {boolean} first Whether or not it is the first load.
 */
async function prepareSettings(first = false) {
    if (first) {
        setupSettingsTabs()
        initSettingsValidators()
        prepareUpdateTab()
    } else {
        await prepareModsTab()
    }
    await initSettingsValues()
    prepareAccountsTab()
    await prepareJavaTab()
    prepareAboutTab()
}

// Prepare the settings UI on startup.
//prepareSettings(true)
