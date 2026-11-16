import { MapRecovery, MAP_LOAD_TIMEOUT_MS } from "../frontend/src/features/map/mapRecovery";
import { DEFAULT_MAP_STYLE, mapStyleUrl } from "../frontend/src/features/map/mapConfig";
describe("Map failure recovery independent of GPS and presence",()=>{
  beforeEach(()=>jest.useFakeTimers());afterEach(()=>jest.useRealTimers());
  it("Given tiles never arrive When the watchdog expires Then retries finitely and leaves degraded status",()=>{
    const publish=jest.fn(),reload=jest.fn(),map=new MapRecovery(publish,reload);
    jest.advanceTimersByTime(90000);
    expect(reload).toHaveBeenCalledTimes(3);expect(publish).toHaveBeenLastCalledWith("degraded");
    jest.advanceTimersByTime(90000);expect(reload).toHaveBeenCalledTimes(3);map.dispose();
  });
  it("Given offline tiles When connectivity returns Then reloads and accepts a complete render",()=>{
    const publish=jest.fn(),reload=jest.fn(),map=new MapRecovery(publish,reload);
    map.connectivity(false);map.error();jest.advanceTimersByTime(90000);expect(reload).not.toHaveBeenCalled();expect(publish).toHaveBeenLastCalledWith("offline");
    map.connectivity(true);expect(reload).toHaveBeenCalledTimes(1);map.ready();jest.advanceTimersByTime(MAP_LOAD_TIMEOUT_MS+1);expect(publish).toHaveBeenLastCalledWith("ready");map.dispose();
  });
  it("Given a lost context or failed tile When restored before retry Then cancels pending work",()=>{
    const publish=jest.fn(),reload=jest.fn(),map=new MapRecovery(publish,reload);
    map.error();map.ready();jest.advanceTimersByTime(90000);expect(reload).not.toHaveBeenCalled();map.dispose();
  });
  it("Given renderer failure or a StrictMode cleanup When timers advance Then never reinitializes or publishes after disposal",()=>{
    const publish=jest.fn(),reload=jest.fn(),map=new MapRecovery(publish,reload);
    map.error(true);map.retry();map.ready();expect(publish).toHaveBeenLastCalledWith("fatal");map.dispose();publish.mockClear();map.error();map.connectivity(true);jest.advanceTimersByTime(90000);expect(publish).not.toHaveBeenCalled();expect(reload).not.toHaveBeenCalled();
  });
  it("Given public provider configuration When parsing Then accepts HTTPS styles and rejects credentials, keys and malformed URLs",()=>{
    expect(mapStyleUrl(undefined)).toBe(DEFAULT_MAP_STYLE);expect(mapStyleUrl('https://maps.example.com/style.json')).toBe('https://maps.example.com/style.json');
    for(const value of ['javascript:alert(1)','http://maps.example.com/style','https://user:secret@example.com/style','https://maps.example.com/?secret=x','bad'])expect(()=>mapStyleUrl(value)).toThrow();
  });
});
