import { DeviceModel } from './modbus/models/device-model';
import { RegisterType } from './modbus/models/enum/register-type';
import { ModbusRegister } from './modbus/models/modbus-register';

export interface IAPI {
    getDeviceModel(): DeviceModel;

    setOnDataReceived(onDataReceived: (value: any, buffer: Buffer, register: ModbusRegister) => Promise<void>): void;
    setOnError(onError: (error: unknown, register: ModbusRegister) => Promise<void>): void;
    setOnDisconnect(onDisconnect: () => Promise<void>): void;

    readAddress(register: ModbusRegister, registerType: RegisterType): Promise<any>;
    readAddressWithoutConversion(register: ModbusRegister, registerType: RegisterType): Promise<Buffer | undefined>;
    readRegistersInBatch(): Promise<void>;

    isConnected(): boolean;

    connect(): Promise<boolean>;
    disconnect(): void;

    writeRegister(register: ModbusRegister, value: any): Promise<boolean>;
    writeValueToRegister(args: any): Promise<void>;
    writeBufferRegister(register: ModbusRegister, buffer: Buffer): Promise<boolean>;
    writeBitsToRegister(register: ModbusRegister, registerType: RegisterType, bits: number[], bitIndex: number): Promise<boolean>;
}