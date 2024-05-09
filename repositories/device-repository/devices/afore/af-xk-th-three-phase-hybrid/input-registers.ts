import { AccessMode } from '../../../models/enum/access-mode';
import { RegisterDataType } from '../../../models/enum/register-datatype';
import { ModbusRegister } from '../../../models/modbus-register';

export const inputRegisters: ModbusRegister[] = [
    ModbusRegister.default('status_text.inverter_name', 0, 6, RegisterDataType.STRING),

    ModbusRegister.default('status_text.hard_name', 11, 4, RegisterDataType.STRING),
    ModbusRegister.default('measure_power.grid_active_power', 535, 2, RegisterDataType.INT32),
    ModbusRegister.default('measure_power.grid_total_load', 547, 2, RegisterDataType.INT32),

    ModbusRegister.transform('status_text.battery_state', 2000, 1, RegisterDataType.UINT16, (value) => {
        switch (value) {
            case 0:
                return 'No battery';
            case 1:
                return 'Fault';
            case 2:
                return 'Sleep';
            case 3:
                return 'Start';
            case 4:
                return 'Charging';
            case 5:
                return 'Discharging';
            case 6:
                return 'Off';
            case 7:
                return 'Wake up';
            default:
                return 'Unknown';
        }
    }),
    ModbusRegister.scale('measure_temperature.battery1', 2001, 1, RegisterDataType.INT16, 0.1),
    ModbusRegister.default('measure_percentage.bat_soc', 2002, 1, RegisterDataType.UINT16),
    ModbusRegister.default('measure_power.battery', 2007, 2, RegisterDataType.INT32),
    ModbusRegister.scale('meter_power.daily_battery_charge', 2009, 1, RegisterDataType.UINT16, 0.1),
    ModbusRegister.scale('meter_power.daily_battery_discharge', 2010, 1, RegisterDataType.UINT16, 0.1),

    ModbusRegister.default('status_code.running_state', 2500, 1, RegisterDataType.UINT16, AccessMode.ReadOnly),

    ModbusRegister.scale('meter_power.total_battery_charge', 2011, 2, RegisterDataType.UINT32, 0.1),
    ModbusRegister.scale('meter_power.total_battery_discharge', 2013, 2, RegisterDataType.UINT32, 0.1),
];