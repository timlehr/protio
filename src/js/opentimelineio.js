import * as log from 'loglevel'
import path from 'path'
import {App} from 'lib/app'

import * as process from 'process'

log.setLevel(0)

/**
 * The main OpenTimelineIO class
 */
export class OpenTimelineIO {
    constructor(app) {
        log.info('starting to attach app')
        this.app = app
        log.info('Attached the app')
    }

    init() {
        log.info('init run')
        $('#export-btn').click(function() {
            this.exportOpenTimelineIO()
        }.bind(this))

        $('#import-btn').click(function() {
            this.importOpenTimelineIO()
        }.bind(this))

        this.status_field = $('#status-field')
        // For whatever reason, a textarea has a tab of empty space on initialization.
        // Stupid web shit.
        this.status_field.text('')


        let acc = document.getElementById("dev-info-panel")
        acc.addEventListener("click", function() {
            /* Toggle between adding and removing the "active" class,
            to highlight the button that controls the panel */
            this.classList.toggle("active")

            /* Toggle between hiding and showing the active panel */
            let panel = this.nextElementSibling
            if (panel.style.display === "block") {
                panel.style.display = "none"
                this.textContent = ""
                this.innerHTML = "&#x25B6 Dev Info"
            } else {
                panel.style.display = "block"
                this.textContent = ""
                this.innerHTML = "&#x25BC Dev Info"
            }

        });
    }

    exportActiveSequenceAsFCP7XML(path) {
        return this.app.evalScript('$.OpenTimelineIOTools.exportActiveSequenceAsFCP7XML("' + path + '")')
    }

    chooseExportLocation() {
        return this.app.evalScript('$.OpenTimelineIOTools.chooseOTIOExportLocation()')
    }

    /**
     *
     * @returns {Promise}
     */
    selectOpenTimelineFile() {
        return this.app.evalScript('$.OpenTimelineIOTools.selectOTIOFileToImport()')
    }

    importSequence(path) {
        console.log('fucking path: ', path)
        return this.app.evalScript('$.OpenTimelineIOTools.importSequence()')
    }

    getTempFolder() {
        let folderPath
        let isWindows = process.platform === 'win32'
        let trailingSlashRegex = isWindows ? /[^:]\\$/ : /.\/$/
        if (isWindows) {
            folderPath = process.env.TEMP || process.env.TMP || (process.env.SystemRoot || process.env.windir ) + '\\temp'
        } else {
            folderPath = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp'
        }
        if (trailingSlashRegex.test(folderPath)) {
            folderPath = folderPath.slice(0, -1)
        }
        return folderPath
    }

    generateTempPath() {
        let now = new Date()
        let folderPath = this.getTempFolder()
        let fileName = [now.getYear(), now.getMonth(), now.getDate(), '-', process.pid, '-', (Math.random() * 0x100000000 + 1).toString(36), '.xml'].join('')
        return path.join(folderPath, fileName)
    }

    /**
     * Export a Premiere Pro Sequence as an OpenTimelineIO file.
     *
     * This is done by exporting a FCP7XML file to a temporary location, then loading that file into OpenTimelineIO,
     * running the adapter on it, and writing that out to disk.
     * @returns {Promise|Promise.<TResult>}
     */
    exportOpenTimelineIO() {
        // Get the export location
        return this.chooseExportLocation()
            .then(function(data) {
                // 'data' coming in should be a full path selected by the user.
                // TODO: Some validation on this path in here.
                // Is it possible for the UI to hand back a folder path?
                // Need to also populate with '.otio' if it doesn't exist.
                let temp_path = this.generateTempPath()
                let jsx_temp_path = this.app.makeJSXPath(temp_path)
                // Then export final cut pro xml with the temp path
                return this.exportActiveSequenceAsFCP7XML(jsx_temp_path)
                    .then(function() {
                        console.log('Sequence should be exported, calling python')
                        // Then run conversion on the temp path file to the user-selected
                        // output path

                        let python_args = [
                            'export-file',
                            '--input',
                            this.app.normalizePath(temp_path),
                            '--output',
                            this.app.normalizePath(data)
                        ]

                        log.debug('Export Python arguments before calling: ', python_args)
                        return this.app.runPython(python_args)
                            .then(function(python_output) {
                                if (python_output.stderr) {
                                    this.status_field.text(python_output.stderr)
                                }
                                console.log('Python output: ', python_output)
                            })
                    }.bind(this))
            }.bind(this))
    }

    /**
     * Import an OpenTimelineIO file into Premiere.
     *
     * This is handled by using the adapters provided by OpenTimelineIO, namely for the FCP7XML Adaoter. I take the
     * given OTIO file, create an OTIO object, write it to FCP7XML in a temporary location, and import that into PPro.
     * @returns {Promise|Promise.<TResult>}
     */
    importOpenTimelineIO() {
        return this.selectOpenTimelineFile()
            .then(function(path) {
                // Clear out the status field.
                this.status_field.text('')
                console.log('About to convert ', path, ' to FCP7XML')
                let temp_path = this.generateTempPath()
                temp_path = this.app.normalizePath(temp_path)

                let python_args = [
                    'convert-file',
                    '--format',
                    'fcp_xml',
                    '--input',
                    this.app.normalizePath(path),
                    '--temp-file',
                    this.app.normalizePath(temp_path)
                ]

                log.debug('Convert Python arguments before calling: ', python_args)

                return this.app.runPython(python_args)
                    .then(function(data) {
                        if (data.stderr) {
                            msg = data.stderr
                            alert(msg)
                            this.status_field.text(data.stderr)
                            throw new Error(msg)
                        }
                        let temp_import_path = data.stdout
                        temp_import_path = this.app.makeJSXPath(temp_import_path)
                        log.debug('Temp Import Path: ', temp_import_path)
                        return this.importSequence(temp_import_path)
                        // Then take THAT output and import FinalCutProXML
                    }.bind(this))
            }.bind(this))
    }
}

$(document).ready(function() {
    console.log('document ready')
    let application = new App()
    window.view = new OpenTimelineIO(application)
    window.view.init()
})