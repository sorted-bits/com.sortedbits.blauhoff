/*
 * Created on Wed Mar 20 2024
 * Copyright © 2024 Wim Haanstra
 *
 * Non-commercial use only
 */

import fs from 'fs';
import path from 'path';
import { unitForCapability } from '../../helpers/units';
import { DeviceRepository } from '../../repositories/device-repository/device-repository';
import { orderModbusRegisters } from '../../repositories/device-repository/helpers/order-modbus-registers';
import { getSupportedFlowTypeKeys } from '../../repositories/device-repository/models/device-model';
import { brands } from '../../repositories/device-repository/models/enum/brand';
import { findFile } from './helpers/fs-helpers';

let output = '';

const capabilitiesOptions: { [key: string]: any } = {};

const driverComposeFiles = findFile('./drivers', 'driver.compose.json');
driverComposeFiles.push(path.resolve('./.homeycompose/drivers/templates/defaults.json'));

for (const file of driverComposeFiles) {
    const json = fs.readFileSync(file, { encoding: 'utf-8' });
    const obj = JSON.parse(json);

    if (obj['capabilitiesOptions']) {
        const allKeys = Object.keys(obj['capabilitiesOptions']);

        for (const key of allKeys) {
            if (obj['capabilitiesOptions'][key]['title']['en']) {
                if (Object.keys(capabilitiesOptions).indexOf(key) === -1) {
                    capabilitiesOptions[key] = obj['capabilitiesOptions'][key]['title']['en'];
                }
            }
        }
    }
}

const readFlowInfo = (flowType: string, flowId: string) => {
    const path = '.homeycompose/flow/' + flowType + '/' + flowId + '.json';

    const json = fs.readFileSync(path, { encoding: 'utf-8' });
    const obj = JSON.parse(json);

    let result: any = {};
    result['id'] = obj['id'];
    result['title'] = obj['title']['en'];
    result['titleFormatted'] = obj['titleFormatted']['en'];

    const args = obj['args'];

    let argsInfo: any[] = [];
    for (const arg of args) {
        if (arg['type'] !== 'device') {
            let argInfo: any = {};

            argInfo['name'] = arg['name'];
            if (arg['title']['en']) {
                argInfo['title'] = arg['title']['en'];
            }
            if (arg['hint'] && arg['hint']['en']) {
                argInfo['hint'] = arg['hint']['en'];
            }

            argInfo['type'] = arg['type'];

            let description = '';
            if (arg['type'] == 'dropdown' && arg['values']) {
                const values = arg['values'];

                values.forEach((value: any) => {
                    description = description.concat(value['title']['en'], '<br/>');
                });
            }

            argInfo['description'] = description;

            argsInfo.push(argInfo);
        }
    }

    result['args'] = argsInfo;

    return result;
};

capabilitiesOptions['measure_power'] = 'Power';
capabilitiesOptions['meter_power'] = 'Energy';

const allFlowTypes = getSupportedFlowTypeKeys();

brands.forEach((brand) => {
    const models = DeviceRepository.getDevicesByBrand(brand);

    output += `# ${brand.toLocaleUpperCase()}\n`;
    models.forEach((model) => {
        output += `## ${model.name}\n`;
        output += `${model.description}\n\n`;

        const registers = model.definition;

        if (registers.inputRegisters.length > 0) {
            output += '### Input Registers\n';
            output += '| Address | Length | Data Type | Unit | Scale | Tranformation | Capability ID | Capability name |\n';
            output += '| ------- | ------ | --------- | ---- | ----- | ------------- | ------------- | --------------- |\n';
            orderModbusRegisters(registers.inputRegisters).forEach((register) => {
                register.parseConfigurations.forEach((config) => {
                    const unit = unitForCapability(config.capabilityId);
                    output += `| ${register.address}`;
                    output += `| ${register.length}`;
                    output += `| ${register.dataType.toString()}`;
                    output += `| ${unit}`;
                    output += `| ${config.scale ?? '-'}`;
                    output += `| ${config.transformation ? 'Yes' : 'No'}`;
                    output += `| ${config.capabilityId}`;
                    output += `| ${capabilitiesOptions[config.capabilityId]} |\n`;
                });
            });
        }

        if (registers.holdingRegisters.length > 0) {
            output += '\n### Holding Registers\n';
            output += '| Address | Length | Data Type | Unit | Scale | Tranformation | Capability ID | Capability name |\n';
            output += '| ------- | ------ | --------- | ---- |----- | -------------- | ------------- | --------------- |\n';
            orderModbusRegisters(registers.holdingRegisters).forEach((register) => {
                register.parseConfigurations.forEach((config) => {
                    const unit = unitForCapability(config.capabilityId);
                    output += `| ${register.address}`;
                    output += `| ${register.length}`;
                    output += `| ${register.dataType.toString()}`;
                    output += `| ${unit}`;
                    output += `| ${config.scale ?? '-'}`;
                    output += `| ${config.transformation ? 'Yes' : 'No'}`;
                    output += `| ${config.capabilityId}`;
                    output += `| ${capabilitiesOptions[config.capabilityId]} |\n`;
                });
            });
        }

        if (model.supportedFlows && model.supportedFlows.actions) {
            output += '\n### Supported flow actions\n';

            allFlowTypes.forEach((flowType) => {
                if (model.supportedFlows && model.supportedFlows.actions) {
                    const flow = model.supportedFlows.actions[flowType];

                    if (flow) {
                        const flowInfo = readFlowInfo('actions', flowType);

                        output += `\n#### ${flowInfo.title}\n`;
                        output += `${flowInfo.titleFormatted}\n`;

                        if (flowInfo.args.length > 0) {
                            output += `| Name | Argument | Type |  Description |\n`;
                            output += `| ------------- | ----- | ------------- | --------------- |\n`;

                            for (const arg of flowInfo.args) {
                                console.log(arg);
                                output += `| ${arg.name} `;
                                output += `| ${arg.title} `;
                                output += `| ${arg.type} `;
                                output += `| ${arg.hint ?? '-'} |\n`;
                            }
                        }
                    }
                }
            });
        }

        output += '\n';
    });
});

fs.writeFileSync('./.build/modbus-registers.md', output);

const readme = fs.readFileSync('./docs/README-template.md', 'utf8');

fs.writeFileSync('./README.md', readme.replace('{{MODBUS_REGISTERS}}', output));
