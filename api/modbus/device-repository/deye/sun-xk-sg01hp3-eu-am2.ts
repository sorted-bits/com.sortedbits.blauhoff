/*
 * Created on Fri Mar 22 2024
 * Copyright © 2024 Wim Haanstra
 *
 * Non-commercial use only
 */
import { RegisterDataType } from '../../models/enum/register-datatype';
import { ModbusRegister } from '../../models/modbus-register';
import { ModbusDeviceDefinition } from '../../models/modbus-device-registers';
import { Brand } from '../../models/enum/brand';
import { DeviceModel } from '../../models/device-model';
import { defaultValueConverter } from '../_shared/default-value-converter';
import { IBaseLogger } from '../../../../helpers/log';
import { AccessMode } from '../../models/enum/access-mode';
import { ModbusAPI } from '../../modbus-api';
import { RegisterType } from '../../models/enum/register-type';
import { logBits, readBit, writeBitsToBuffer } from '../../../blauhoff/helpers/bits';
import { log } from 'console';

const inputRegisters: ModbusRegister[] = [];

const holdingRegisters: ModbusRegister[] = [
    // settings
    ModbusRegister.default('status_code.modbus_address', 1, 1, RegisterDataType.UINT16),
    ModbusRegister.default('status_code.modbus_protocol', 2, 1, RegisterDataType.UINT16),
    ModbusRegister.default('serial', 3, 5, RegisterDataType.STRING),
    ModbusRegister.scale('status_code.zero_export_power', 104, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    ModbusRegister.scale('status_code.max_sell_power', 143, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    //time of use, we have to discuss a way how to handle these
    ModbusRegister.default('status_code.grid_tou_time1', 148, 1, RegisterDataType.UINT16, AccessMode.ReadWrite), // 6 o'clock is shown as 600
    ModbusRegister.default('status_code.grid_tou_time2', 149, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_time3', 150, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_time4', 151, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_time5', 152, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_time6', 153, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.scale('status_code.grid_tou_power1', 154, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    ModbusRegister.scale('status_code.grid_tou_power2', 155, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    ModbusRegister.scale('status_code.grid_tou_power3', 156, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    ModbusRegister.scale('status_code.grid_tou_power4', 157, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    ModbusRegister.scale('status_code.grid_tou_power5', 158, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    ModbusRegister.scale('status_code.grid_tou_power6', 159, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_capacity1', 166, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_capacity2', 167, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_capacity3', 168, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_capacity4', 169, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_capacity5', 170, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    ModbusRegister.default('status_code.grid_tou_capacity6', 171, 1, RegisterDataType.UINT16, AccessMode.ReadWrite),
    //

    ModbusRegister.scale('status_code.grid_peak_shaving_power', 191, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),
    ModbusRegister.scale('status_code.max_solar_power', 340, 1, RegisterDataType.UINT16, 10, AccessMode.ReadWrite),

    ModbusRegister.transform(
        'status_text.energie_management_model',
        141,
        1,
        RegisterDataType.UINT16,
        (value) => {
            const firstBit = value & 1;

            if (firstBit === 0) {
                return 'Battery First';
            } else if (firstBit === 1) {
                return 'Load First';
            } else {
                return 'Unknown';
            }
        },
        AccessMode.ReadWrite,
    ),

    ModbusRegister.transform(
        'status_text.work_mode',
        142,
        1,
        RegisterDataType.UINT16,
        (value) => {
            if (value === 0) {
                return 'Selling First';
            } else if (value === 1) {
                return 'Zero Export To Load';
            } else if (value === 2) {
                return 'Zero Export To CT';
            } else {
                return 'Unknown';
            }
        },
        AccessMode.ReadWrite,
    ),

    ModbusRegister.transform(
        'status_text.sell_solar',
        145,
        1,
        RegisterDataType.UINT16,
        (value) => {
            return value === 1 ? 'Yes' : 'No';
        },
        AccessMode.ReadWrite,
    ),

    //more states are possible to choose days of week
    ModbusRegister.transform(
        'status_text.time_of_use',
        146,
        1,
        RegisterDataType.UINT16,
        (value) => {
            if (value === 0) {
                return 'time of use, off';
            } else if (value === 255) {
                return 'time of use, all days on';
            } else {
                return 'Unknown';
            }
        },
        AccessMode.ReadWrite,
    ),

    //repeat for addresse 172/177
    ModbusRegister.transform(
        'status_text.tou_grid_charge',
        172,
        1,
        RegisterDataType.UINT16,
        (value) => {
            const firstBit = value & 1; // read 1th bit
            if (firstBit === 0) {
                return 'Grid charge off';
            } else if (firstBit === 1) {
                return 'Grid charge on';
            } else {
                return 'Unknown';
            }
        },
        AccessMode.ReadWrite,
    ),

    //repeat for addresse 172/177
    ModbusRegister.transform(
        'status_text.tou_gen_charge',
        172,
        1,
        RegisterDataType.UINT16,
        (value) => {
            const secondBit = value & 2; // read 2th bit
            if (secondBit === 0) {
                return 'Gen charge off';
            } else if (secondBit === 1) {
                return 'Gen charge on';
            } else {
                return 'Unknown';
            }
        },
        AccessMode.ReadWrite,
    ),

    //add to default
    ModbusRegister.transform(
        'status_text.grid_peak_shaving',
        178,
        1,
        RegisterDataType.UINT16,
        (value) => {
            const fourthBit = (value & 8) >> 3; // read 4th bit
            const fifthBit = (value & 16) >> 4; // read 5th bit

            if (fourthBit === 1 && fifthBit === 0) {
                return 'Disabled';
            } else if (fourthBit === 1 && fifthBit === 1) {
                return 'Enabled';
            } else {
                return 'Unknown';
            }
        },
        AccessMode.ReadWrite,
    ),

    ModbusRegister.transform('status_text.run_mode', 500, 1, RegisterDataType.UINT16, (value) => {
        if (value === 0) {
            return 'Standby';
        } else if (value === 1) {
            return 'Selftest';
        } else if (value === 2) {
            return 'Normal';
        } else if (value === 3) {
            return 'Alarm';
        } else if (value === 4) {
            return 'Fault';
        } else {
            return 'Unknown';
        }
    }),

    // meters
    ModbusRegister.scale('meter_power.daily_from_grid', 520, 1, RegisterDataType.UINT16, 0.1), // day gridbuy
    ModbusRegister.scale('meter_power.daily_to_grid', 521, 1, RegisterDataType.UINT16, 0.1), // day gridsell
    ModbusRegister.scale('meter_power.total_from_grid', 522, 2, RegisterDataType.UINT16, 0.1), // total gridbuy
    ModbusRegister.scale('meter_power.total_to_grid', 524, 2, RegisterDataType.UINT16, 0.1), // total gridsell
    ModbusRegister.scale('meter_power.daily_to_load', 526, 1, RegisterDataType.UINT16, 0.1), // consumption day
    ModbusRegister.scale('meter_power.total_to_load', 527, 2, RegisterDataType.UINT16, 0.1), // total consumption
    ModbusRegister.scale('meter_power.daily_pv', 529, 1, RegisterDataType.UINT16, 0.1), // day pv power
    ModbusRegister.scale('meter_power.total_pv', 534, 2, RegisterDataType.UINT16, 0.1), // total PV power
    ModbusRegister.scale('meter_power.daily_battery_charge', 514, 1, RegisterDataType.UINT16, 0.1), // day batt charge
    ModbusRegister.scale('meter_power.daily_battery_discharge', 515, 1, RegisterDataType.UINT16, 0.1), // day batt discharge
    ModbusRegister.scale('meter_power.total_battery_charge', 516, 2, RegisterDataType.UINT16, 0.1), // total batt charge
    ModbusRegister.scale('meter_power.total_battery_discharge', 518, 2, RegisterDataType.UINT16, 0.1), // total batt discharge

    // pv
    ModbusRegister.scale('measure_power.pv1', 672, 1, RegisterDataType.UINT16, 10),
    ModbusRegister.scale('measure_power.pv2', 673, 1, RegisterDataType.UINT16, 10),

    //ModbusRegister.scale('measure_current.pv1', 677, 1, RegisterDataType.UINT16, 0.1),
    //ModbusRegister.scale('measure_current.pv2', 679, 1, RegisterDataType.UINT16, 0.1),
    //ModbusRegister.scale('measure_voltage.pv1', 676, 1, RegisterDataType.UINT16, 0.1),
    //ModbusRegister.scale('measure_voltage.pv2', 678, 1, RegisterDataType.UINT16, 0.1),

    // grid
    ModbusRegister.default('measure_power.grid', 625, 1, RegisterDataType.UINT16),
    //ModbusRegister.default('measure_power.total_active_in_power', 607, 1, RegisterDataType.INT16), //irrelevant?
    //ModbusRegister.default('measure_power.grid_int_ctl1', 604, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.grid_int_ctl2', 605, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.grid_int_ctl3', 606, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.grid_ext_ctl1', 616, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.grid_ext_ctl2', 617, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.grid_ext_ctl3', 618, 1, RegisterDataType.INT16),

    ModbusRegister.scale('measure_voltage.grid_l1', 598, 1, RegisterDataType.UINT16, 0.1),
    ModbusRegister.scale('measure_voltage.grid_l2', 599, 1, RegisterDataType.UINT16, 0.1),
    ModbusRegister.scale('measure_voltage.grid_l3', 600, 1, RegisterDataType.UINT16, 0.1),

    // generator
    // ModbusRegister.scale('measure_power.gen_port', 667, 1, RegisterDataType.UINT16, 0),

    // inverter
    ModbusRegister.default('measure_power.inverter', 636, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.inverter_l1', 633, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.inverter_l2', 634, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.inverter_l3', 635, 1, RegisterDataType.INT16),

    //ModbusRegister.scale('measure_current.inverter_l1', 630, 1, RegisterDataType.INT16, 0.01),
    //ModbusRegister.scale('measure_current.inverter_l2', 631, 1, RegisterDataType.INT16, 0.01),
    //ModbusRegister.scale('measure_current.inverter_l3', 632, 1, RegisterDataType.INT16, 0.01),
    //ModbusRegister.scale('measure_voltage.inverter_l1', 627, 1, RegisterDataType.UINT16, 0.1),
    //ModbusRegister.scale('measure_voltage.inverter_l2', 628, 1, RegisterDataType.UINT16, 0.1),
    //ModbusRegister.scale('measure_voltage.inverter_l3', 629, 1, RegisterDataType.UINT16, 0.1),
    ModbusRegister.scale('measure_temperature.ac', 541, 1, RegisterDataType.UINT16, 0.01),

    // battery
    ModbusRegister.scale('measure_power.battery1', 590, 1, RegisterDataType.INT16, 10),
    //ModbusRegister.scale('measure_power.battery2', 595, 1, RegisterDataType.INT16, 10),

    ModbusRegister.scale('measure_current.battery1', 591, 1, RegisterDataType.INT16, 0.01),
    //ModbusRegister.scale('measure_current.battery2', 594, 1, RegisterDataType.INT16, 0.01),
    ModbusRegister.scale('measure_voltage.battery1', 587, 1, RegisterDataType.INT16, 0.1),
    //ModbusRegister.scale('measure_voltage.battery2', 593, 1, RegisterDataType.INT16, 0.1),

    ModbusRegister.default('measure_percentage.battery1', 588, 1, RegisterDataType.UINT16), // SOC
    //ModbusRegister.default('measure_percentage.battery2', 589, 1, RegisterDataType.UINT16), // SOC

    ModbusRegister.scale('measure_temperature.battery1', 586, 1, RegisterDataType.UINT16, 0.01),
    //ModbusRegister.scale('measure_temperature.battery2', 596, 1, RegisterDataType.UINT16, 0.01),
    ModbusRegister.scale('measure_temperature.dc', 540, 1, RegisterDataType.UINT16, 0.01),

    // load
    ModbusRegister.default('measure_power.load', 653, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.load_l1', 650, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.load_l2', 651, 1, RegisterDataType.INT16),
    //ModbusRegister.default('measure_power.load_l3', 652, 1, RegisterDataType.INT16),

    //ModbusRegister.scale('measure_voltage.load_l1', 644, 1, RegisterDataType.UINT16, 0.1),
    //ModbusRegister.scale('measure_voltage.load_l2', 645, 1, RegisterDataType.UINT16, 0.1),
    //ModbusRegister.scale('measure_voltage.load_l3', 646, 1, RegisterDataType.UINT16, 0.1),

    // ups
    ModbusRegister.default('measure_power.ups', 643, 1, RegisterDataType.UINT16), //gives a low random value when nothing is connected
    //ModbusRegister.default('measure_power.ups_l1', 640, 1, RegisterDataType.UINT16),
    //ModbusRegister.default('measure_power.ups_l2', 641, 1, RegisterDataType.UINT16),
    //ModbusRegister.default('measure_power.ups_l3', 642, 1, RegisterDataType.UINT16),
];

const setMaxSolarPower = async (origin: IBaseLogger, args: any, client: ModbusAPI): Promise<void> => {
    const address = 340;
    const registerType = RegisterType.Holding;

    const register = client.getAddressByType(registerType, address);

    if (register === undefined) {
        origin.error('Register not found');
        return;
    }

    const { value } = args;

    origin.log('Setting max solar power to: ', value);

    if (value < 1000 || value > 7800) {
        origin.error('Value out of range');
        return;
    }

    try {
        const payload = register.calculatePayload(value, origin);
        const result = await client.writeRegister(register, payload);
        origin.log('Output', result);
    } catch (error) {
        origin.error('Error enabling solar selling', error);
    }
};

const setMaxSellPower = async (origin: IBaseLogger, args: any, client: ModbusAPI): Promise<void> => {
    const address = 143;
    const registerType = RegisterType.Holding;

    const register = client.getAddressByType(registerType, address);

    if (register === undefined) {
        origin.error('Register not found');
        return;
    }

    const { value } = args;

    origin.log('Setting max sell power to: ', value);

    if (value < 10 || value > 16000) {
        origin.error('Value out of range');
        return;
    }

    try {
        const payload = register.calculatePayload(value, origin);
        const result = await client.writeRegister(register, payload);
        origin.log('Output', result);
    } catch (error) {
        origin.error('Error enabling solar selling', error);
    }
};

const setSolarSell = async (origin: IBaseLogger, args: any, client: ModbusAPI): Promise<void> => {
    const address = 145;
    const registerType = RegisterType.Holding;

    const register = client.getAddressByType(registerType, address);
    if (register === undefined) {
        origin.error('Register not found');
        return;
    }

    const { enabled } = args;

    origin.log('Setting solar selling to: ', enabled);

    try {
        const result = await client.writeRegister(register, enabled ? 1 : 0);
        origin.log('Output', result);
    } catch (error) {
        origin.error('Error enabling solar selling', error);
    }
};

const writeValueToRegister = async (origin: IBaseLogger, args: any, client: ModbusAPI): Promise<void> => {
    client.writeValueToRegister(origin, args);
};

const setEnergyPattern = async (origin: IBaseLogger, args: any, client: ModbusAPI): Promise<void> => {
    const address = 141;
    const registerType = RegisterType.Holding;

    const register = client.getAddressByType(registerType, address);

    if (register === undefined) {
        origin.error('Register not found');
        return;
    }

    const { value } = args;

    if (value !== 'batt_first' && value !== 'load_first') {
        origin.error('Invalid value', value);
        return;
    }

    origin.log('Setting energy pattern to: ', value);

    const newBits = value === 'batt_first' ? [0] : [1];

    try {
        const currentValue = await client.readAddressWithoutConversion(register, RegisterType.Holding);

        if (!currentValue) {
            throw new Error('Error reading current value');
        }

        logBits(origin, currentValue.buffer, currentValue.buffer.length);

        const byteIndex = 1; // Big Endian so we count in reverse
        const resultBuffer = writeBitsToBuffer(currentValue.buffer, byteIndex, newBits);
        logBits(origin, resultBuffer, resultBuffer.length);

        const result = await client.writeBufferRegister(register, resultBuffer);
        origin.log('Output', result);
    } catch (error) {
        origin.error('Error reading current value', error);
        return;
    }
};

const setWorkmodeAndZeroExportPower = async (origin: IBaseLogger, args: any, client: ModbusAPI): Promise<void> => {
    const modeAddress = 142;
    const powerAddress = 104;
    const registerType = RegisterType.Holding;
    const workmodes = [
        { id: 'selling_first', value: 0 },
        {
            id: 'zero_export_to_load',
            value: 1,
        },
        {
            id: 'zero_export_to_ct',
            value: 2,
        },
    ];

    const modeRegister = client.getAddressByType(registerType, modeAddress);
    const powerRegister = client.getAddressByType(registerType, powerAddress);

    if (!modeRegister || !powerRegister) {
        origin.error('Register not found');
        return;
    }

    const { value, workmode } = args;

    const workmodeDefinition = workmodes.find((m) => m.id === workmode);

    if (!workmodeDefinition) {
        origin.error('Invalid workmode', workmode);
        return;
    }

    if (value < 0 || value > 100) {
        origin.error('Value out of range', value);
        return;
    }

    origin.log('Setting workmode to ', workmode, 'with zero export power to ', value, 'W');

    const workModeValue = workmodeDefinition.value;

    try {
        const modeResult = await client.writeRegister(modeRegister, workModeValue);
        origin.log('Workmode output', modeResult);

        const payload = powerRegister.calculatePayload(value, origin);
        const powerResult = await client.writeRegister(powerRegister, payload);
        origin.log('Power output', powerResult);
    } catch (error) {
        origin.error('Error setting workmode or power', error);
    }
};

const setGridPeakShavingOn = async (origin: IBaseLogger, args: any, client: ModbusAPI): Promise<void> => {
    const modeAddress = 178;
    const powerAddress = 191;
    const registerType = RegisterType.Holding;

    const modeRegister = client.getAddressByType(registerType, modeAddress);
    const powerRegister = client.getAddressByType(registerType, powerAddress);

    if (!modeRegister || !powerRegister) {
        origin.error('Register not found');
        return;
    }

    const { value } = args;

    if (value < 0 || value > 16000) {
        origin.error('Value out of range', value);
        return;
    }

    origin.log('Setting Grid Peak Shaving mode on with ', value, 'W');

    try {
        const currentValue = await client.readAddressWithoutConversion(modeRegister, RegisterType.Holding);

        if (!currentValue) {
            throw new Error('Error reading current value');
        }

        logBits(origin, currentValue.buffer, currentValue.buffer.length);

        const newBits = [1, 1];
        const startBitIndex = 4;

        const byteIndex = 1; // Big Endian so we count in reverse
        const resultBuffer = writeBitsToBuffer(currentValue.buffer, byteIndex, newBits, startBitIndex);
        logBits(origin, resultBuffer, resultBuffer.length);

        const result = await client.writeBufferRegister(modeRegister, resultBuffer);
        origin.log('Output', result);

        const payload = powerRegister.calculatePayload(value, origin);
        const powerResult = await client.writeRegister(powerRegister, payload);
        origin.log('Power output', powerResult);
    } catch (error) {
        origin.error('Error setting workmode or power', error);
    }
};

const setGridPeakShavingOff = async (origin: IBaseLogger, args: any, client: ModbusAPI): Promise<void> => {
    const modeAddress = 178;
    const registerType = RegisterType.Holding;

    const modeRegister = client.getAddressByType(registerType, modeAddress);

    if (!modeRegister) {
        origin.error('Register not found');
        return;
    }

    origin.log('Setting Grid Peak Shaving mode off');

    try {
        const currentValue = await client.readAddressWithoutConversion(modeRegister, RegisterType.Holding);

        if (!currentValue) {
            throw new Error('Error reading current value');
        }

        logBits(origin, currentValue.buffer, currentValue.buffer.length);

        const newBits = [0, 1];
        const startBitIndex = 4;

        const byteIndex = 1; // Big Endian so we count in reverse
        const resultBuffer = writeBitsToBuffer(currentValue.buffer, byteIndex, newBits, startBitIndex);

        logBits(origin, resultBuffer, resultBuffer.length);

        const result = await client.writeBufferRegister(modeRegister, resultBuffer);
        origin.log('Output', result);
    } catch (error) {
        origin.error('Error setting workmode or power', error);
    }
};

// eslint-disable-next-line camelcase
const definition: ModbusDeviceDefinition = {
    inputRegisters,
    holdingRegisters,
    inputRegisterResultConversion: defaultValueConverter,
    holdingRegisterResultConversion: defaultValueConverter,
    deprecatedCapabilities: ['status_code.work_mode', 'status_code.run_mode'],
};

export const deyeSunXKSG01HP3: DeviceModel = {
    id: 'deye-sun-xk-sg01hp3-eu-am2',
    brand: Brand.Deye,
    name: 'Deye Sun *K SG01HP3 EU AM2 Series',
    description: 'Deye Sun *K SG01HP3 EU AM2 Series with modbus interface',
    debug: true,
    definition,
    supportedFlows: {
        actions: {
            set_max_solar_power: setMaxSolarPower,
            set_solar_sell: setSolarSell,
            set_max_sell_power: setMaxSellPower,
            write_value_to_register: writeValueToRegister,
            set_energy_pattern: setEnergyPattern,
            set_grid_peak_shaving_on: setGridPeakShavingOn,
            set_grid_peak_shaving_off: setGridPeakShavingOff,
            set_work_mode_and_zero_export_power: setWorkmodeAndZeroExportPower,
        },
    },
};
