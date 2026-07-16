import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushSave } = vi.hoisted(() => ({ pushSave: vi.fn() }));
vi.mock("@/services/client/save", () => ({ pushSave }));

import { useGameStore } from "@/lib/store";
import { pushLocalSaveToServer } from "@/lib/store-sync";

beforeEach(() => {
  useGameStore.getState().reset();
  useGameStore.getState().setServerSaveVersion(0);
  pushSave.mockReset();
});

describe("pushLocalSaveToServer", () => {
  it("pushes the current save with serverSaveVersion as baseVersion, then stores the new version", async () => {
    useGameStore.getState().setServerSaveVersion(3);
    useGameStore.getState().addCoins(50);
    pushSave.mockResolvedValue({ version: 4 });

    await pushLocalSaveToServer();

    expect(pushSave).toHaveBeenCalledTimes(1);
    const [baseVersion, save] = pushSave.mock.calls[0];
    expect(baseVersion).toBe(3);
    expect(save).toMatchObject({ coins: 50 });
    expect(useGameStore.getState().serverSaveVersion).toBe(4);
  });

  it("on conflict, logs and leaves serverSaveVersion unchanged", async () => {
    useGameStore.getState().setServerSaveVersion(3);
    pushSave.mockResolvedValue({ conflict: true });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await pushLocalSaveToServer();

    expect(useGameStore.getState().serverSaveVersion).toBe(3);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("swallows transport errors without throwing", async () => {
    pushSave.mockRejectedValue(new Error("network down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(pushLocalSaveToServer()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does not overlap concurrent calls", async () => {
    let resolvePush: (v: { version: number }) => void;
    pushSave.mockReturnValue(
      new Promise((resolve) => {
        resolvePush = resolve;
      }),
    );

    const first = pushLocalSaveToServer();
    const second = pushLocalSaveToServer();
    resolvePush!({ version: 1 });
    await Promise.all([first, second]);

    expect(pushSave).toHaveBeenCalledTimes(1);
  });
});
