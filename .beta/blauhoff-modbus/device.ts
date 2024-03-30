/*
 * Created on Wed Mar 20 2024
 * Copyright © 2024 Wim Haanstra
 *
 * Non-commercial use only
 */

import { addCapabilityIfNotExists, capabilityChange, deprecateCapability, Device } from 'homey-helpers';
import { DateTime } from 'luxon';
import { ModbusAPI } from '../../api/modbus/modbus-api';
import { ModbusRegister } from '../../api/modbus/models/modbus-register';
import { ModbusDeviceDefinition } from '../../api/modbus/models/modbus-device-registers';
import { getBrand } from '../../api/modbus/helpers/brand-name';
import { orderModbusRegisters } from '../../api/modbus/helpers/order-modbus-registers';
import { DeviceRepository } from '../../api/modbus/device-repository/device-repository';
import { DeviceModel } from '../../api/modbus/models/device-model';
import { Brand } from '../../api/modbus/models/enum/brand';
import { DeviceAction } from '../../api/modbus/helpers/set-modes';

class ModbusDevice extends Device {
    private api?: ModbusAPI;
    private reachable: boolean = false;
    private readRegisterTimeout: NodeJS.Timeout | undefined;
    private device!: DeviceModel;

    public filteredLog(...args: any[]) {
        if (this.device.brand === Brand.Deye) {
            this.log(args);
        }
    }

    private onDisconnect = async () => {
        if (this.readRegisterTimeout) {
            clearTimeout(this.readRegisterTimeout);
        }

        if (!this.api) {
            return;
        }

        const isOpen = await this.api.connect();

        if (!isOpen) {
            await this.setUnavailable('Modbus connection unavailable');

            this.homey.setTimeout(this.onDisconnect, 60000);
        } else {
            await this.setAvailable();
            await this.readRegisters();
        }
    };

    /**
     * Handles the value received from a Modbus register.
     *
     * @param value - The value received from the Modbus register.
     * @param register - The Modbus register object.
     * @returns A Promise that resolves when the value is handled.
     */
    private onDataReceived = async (value: any, register: ModbusRegister) => {
        const result = register.calculateValue(value);

        if (this.device.brand === Brand.Deye) {
            this.filteredLog(register.capabilityId, result);
        }

        await capabilityChange(this, register.capabilityId, result);

        if (!this.reachable) {
            this.reachable = true;
            await capabilityChange(this, 'readable_boolean.device_status', true);
        }
    };

    /**
     * Handles the error that occurs during a Modbus operation.
     * If the error is a TransactionTimedOutError, sets the device as unreachable.
     * Otherwise, logs the error message.
     *
     * @param error - The error that occurred.
     * @param register - The Modbus register associated with the error.
     */
    private onError = async (error: unknown, register: ModbusRegister) => {
        if (error && (error as any)['name'] && (error as any)['name'] === 'TransactionTimedOutError') {
            this.reachable = false;
            await capabilityChange(this, 'readable_boolean.device_status', false);
        } else {
            this.error('Request failed', error);
        }
    };

    /**
     * Initializes the capabilities of the Modbus device based on the provided definition.
     * @param definition The Modbus device definition.
     */
    private initializeCapabilities = async (definition: ModbusDeviceDefinition) => {
        const inputRegisters = orderModbusRegisters(definition.inputRegisters);

        for (const register of inputRegisters) {
            await addCapabilityIfNotExists(this, register.capabilityId);
        }

        const holdingRegisters = orderModbusRegisters(definition.holdingRegisters);
        for (const register of holdingRegisters) {
            await addCapabilityIfNotExists(this, register.capabilityId);
        }
    };

    /**
     * Establishes a connection to the Modbus device.
     * @returns {Promise<void>} A promise that resolves when the connection is established.
     */
    private connect = async () => {
        const { host, port, unitId } = this.getSettings();
        const { deviceType, modelId } = this.getData();

        if (this.readRegisterTimeout) {
            clearTimeout(this.readRegisterTimeout);
        }

        this.log('ModbusDevice', host, port, unitId, deviceType, modelId);

        await this.initializeCapabilities(this.device.definition);

        this.api = new ModbusAPI(this, host, port, unitId, this.device.definition);
        this.api.onDataReceived = this.onDataReceived;
        this.api.onError = this.onError;
        this.api.onDisconnect = this.onDisconnect;

        const isOpen = await this.api.connect();

        if (isOpen) {
            await this.readRegisters();
        }
    };

    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        await super.onInit();

        const { deviceType, modelId } = this.getData();

        const brand = getBrand(deviceType);
        if (!brand) {
            this.error('Unknown device type', deviceType);
            throw new Error('Unknown device type');
        }

        const result = DeviceRepository.getDeviceByBrandAndModel(brand, modelId);

        if (!result || !result?.definition) {
            this.error('Unknown device type', deviceType);
            throw new Error('Unknown device type');
        }

        this.device = result;
        this.filteredLog('ModbusDevice has been initialized');

        await deprecateCapability(this, 'status_code.device_online');
        await addCapabilityIfNotExists(this, 'readable_boolean.device_status');
        await addCapabilityIfNotExists(this, 'date.record');

        const deprecated = this.device.definition.deprecatedCapabilities;
        this.log('Deprecated capabilities', deprecated);
        if (deprecated) {
            for (const capability of deprecated) {
                this.log('Deprecating capability', capability);
                await deprecateCapability(this, capability);
            }
        }

        await this.connect();
    }

    /**
     * Reads the registers from the device.
     *
     * @returns {Promise<void>} A promise that resolves when the registers are read.
     */
    private readRegisters = async () => {
        if (!this.api) {
            this.error('ModbusAPI is not initialized');
            return;
        }

        const { readInBatch } = this.getSettings();

        this.log('Reading registers in batch', readInBatch);

        const localTimezone = this.homey.clock.getTimezone();
        const date = DateTime.now();
        const localDate = date.setZone(localTimezone);

        await capabilityChange(this, 'date.record', localDate.toFormat('HH:mm:ss'));

        this.filteredLog('Reading registers for ', this.getName());

        if (readInBatch) {
            await this.api.readRegistersInBatch();
        } else {
            await this.api.readRegisters();
        }

        const { refreshInterval } = this.getSettings();

        this.filteredLog('Setting timeout', refreshInterval, this.reachable);
        const interval = this.reachable ? refreshInterval * 1000 : 60000;

        this.readRegisterTimeout = await this.homey.setTimeout(this.readRegisters.bind(this), interval);
    };

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.filteredLog('ModbusDevice has been added');
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({
        oldSettings,
        newSettings,
        changedKeys,
    }: {
        oldSettings: { [key: string]: boolean | string | number | undefined | null };
        newSettings: { [key: string]: boolean | string | number | undefined | null };
        changedKeys: string[];
    }): Promise<string | void> {
        this.filteredLog('ModbusDevice settings where changed');

        if (this.readRegisterTimeout) {
            clearTimeout(this.readRegisterTimeout);
        }

        if (this.api?.isOpen) {
            await this.api?.disconnect();
        }

        await this.connect();
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name: string) {
        this.filteredLog('ModbusDevice was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        this.filteredLog('ModbusDevice has been deleted');

        if (this.readRegisterTimeout) {
            clearTimeout(this.readRegisterTimeout);
        }

        if (this.api?.isOpen) {
            await this.api?.disconnect();
        }
    }

    callAction = async (action: DeviceAction, args: any) => {
        this.log('callAction', this.device.name, action);

        await this.api?.callAction(action, args);
    };
}

module.exports = ModbusDevice;