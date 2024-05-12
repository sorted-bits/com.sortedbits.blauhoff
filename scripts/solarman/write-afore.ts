/*
 * Created on Wed Mar 20 2024
 * Copyright © 2024 Wim Haanstra
 *
 * Non-commercial use only
 */

import { Solarman } from '../../api/solarman/solarman';
import { Logger } from '../../helpers/log';
import { DeviceRepository } from '../../repositories/device-repository/device-repository';
import { AforeAFXKTH } from '../../repositories/device-repository/devices/afore/af-xk-th-three-phase-hybrid/af-xk-th-three-phase-hybrid';
import { ModbusRegisterParseConfiguration } from '../../repositories/device-repository/models/modbus-register';

require('dotenv').config();

const log = new Logger();

if (!process.env.HOST || !process.env.PORT || !process.env.SERIAL || !process.env.PORT || !process.env.DEVICE_ID || !process.env.UNIT_ID) {
    log.error('Missing environment variables');
    process.exit(1);
}

const host = process.env.HOST;
const port = process.env.PORT;
const serial = process.env.SERIAL;
const deviceId = process.env.DEVICE_ID;
const unitId = process.env.UNIT_ID;

const valueSolarmanResolved = async (value: any, buffer: Buffer, parseConfiguration: ModbusRegisterParseConfiguration) => {
    const result = parseConfiguration.calculateValue(value, buffer, log);
    log.log(parseConfiguration.capabilityId, ':', result);
};

const device = DeviceRepository.getInstance().getDeviceById(deviceId) as AforeAFXKTH;

if (!device) {
    log.error('Device not found');
    process.exit(1);
}

const solarmanApi = new Solarman(log, device, host, serial, Number(port), Number(unitId));
solarmanApi.setOnDataReceived(valueSolarmanResolved);

const perform = async (): Promise<void> => {
    await solarmanApi.connect();
    //    await solarmanApi.readRegistersInBatch();

    /* SELF USE */
    //    await device.setEmsMode(log, { mode: 0 }, solarmanApi);
    await device.callAction(log, 'set_ems_mode', { mode: 0 }, solarmanApi);

    /* COMMAND MODE */
    // await device.setEmsMode(log, { mode: 4 }, solarmanApi);
};

perform()
    .then(() => {
        log.log('Registers read');
    })
    .catch(log.error)
    .finally(() => {
        solarmanApi.disconnect();
    });
