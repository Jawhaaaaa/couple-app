package mn.aura.couple.auth.app;

import mn.aura.couple.auth.domain.DeviceSession;

/** Нэвтэрч буй төхөөрөмж (`DeviceInfo` эсвэл толгойноос таамагласан). */
public record Device(String name, DeviceSession.Platform platform) {
}
