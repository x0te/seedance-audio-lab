"""Frozen prompt set for every experimental condition (pre-registered before any output was seen)."""

REFS = "Use @Image1 as the exact character reference. Use @Image2 for the environment and visual atmosphere."

SCENE = (
    "The character works intensely at her desk inside the animation studio, drawing on the pen tablet "
    "and checking the two monitors. The scene gradually becomes more energetic: her movements speed up "
    "and the camera becomes more dynamic. At the climax, the camera performs its most dramatic movement "
    "and reveals the Seoul cityscape outside the huge window. Stylized 3D feature-animation look."
)

E1 = {
    # no audio reference; model free to choose timing
    "E1-T": f"{REFS}\n\n{SCENE}\n\nUpbeat electronic music that builds up to a big drop.",
    # no audio reference; timing given as text timestamps
    "E1-TT": (
        f"{REFS}\n\n{SCENE}\n\n"
        "TIMING\n"
        "0-6 seconds: calm, slow camera, small movements.\n"
        "6-8 seconds: build-up, her movements accelerate and the camera becomes more dynamic.\n"
        "At exactly 8 seconds: the climax - the most dramatic camera movement reveals the Seoul cityscape.\n"
        "8-12 seconds: high energy, fast motion.\n\n"
        "Upbeat electronic music that builds up to a big drop at 8 seconds."
    ),
    # audio reference, naive instruction
    "E1-N": f"{REFS}\n\n{SCENE}\n\nMatch the video to the music in @Audio1.",
    # audio reference, role-mapped "audio as master clock" template (identical for drop8 / drop4)
    "E1-R": (
        "REFERENCE ROLES\n"
        "@Image1: main character identity, clothing and appearance.\n"
        "@Image2: environment and visual art direction.\n"
        "@Audio1: master rhythm and pacing reference.\n\n"
        f"SCENE\n{SCENE}\n\n"
        "AUDIO-VISUAL CHOREOGRAPHY\n"
        "@Audio1 controls the temporal rhythm of the entire sequence.\n"
        "Character movement follows the dynamic contour of the music.\n"
        "Camera acceleration increases naturally during the musical build.\n"
        "Major camera transitions occur on strong musical accents.\n"
        "At the strongest musical peak (the drop), the camera performs its most dramatic movement "
        "and reveals the Seoul cityscape outside the window.\n"
        "During the high-energy section after the drop, motion stays energetic and locked to the beat."
    ),
}

# Experiment 2 - temporal reference conflict (@Video1 slow dolly vs @Audio1 120 BPM EDM)
E2 = {
    "E2-U": f"Use @Image1 as the character and @Image2 as the environment. Use @Video1 and @Audio1 as references.\n\n{SCENE}",
    "E2-S": (
        "REFERENCE ROLES\n"
        "@Image1: main character identity, clothing and appearance.\n"
        "@Image2: environment and visual art direction.\n"
        "@Video1: camera movement reference only. Follow only the camera movement style of @Video1. "
        "Do not copy its subject or environment.\n"
        "@Audio1: master rhythm and pacing reference.\n\n"
        f"SCENE\n{SCENE}\n\n"
        "@Video1 controls only camera motion.\n"
        "@Audio1 controls tempo and energy.\n"
        "Do not allow the two references to compete."
    ),
    "E2-V": (
        "REFERENCE ROLES\n"
        "@Image1: main character identity, clothing and appearance.\n"
        "@Image2: environment and visual art direction.\n"
        "@Video1: camera movement reference only. Follow only the camera movement style of @Video1. "
        "Do not copy its subject or environment.\n\n"
        f"SCENE\n{SCENE}\n\n"
        "@Video1 controls only camera motion."
    ),
}

LINE = "설마 이걸 진짜 먹으라고?"
E3_HEAD = (
    f"{REFS}\n\n"
    "Medium close-up of the character sitting at her desk, facing the camera, a slice of pizza on a plate in front of her. "
    "Camera remains stable. No background music."
)
E3_TAIL = "Natural Korean speech. Accurate lip synchronization. Subtle facial reaction after finishing the line."
E3 = {
    # Reddit-style bracketed timestamp syntax
    "E3-B": (
        f"{E3_HEAD}\n\n"
        "[AUDIO: 1s] a loud knock on the door off-screen\n"
        f"[AUDIO: 4s] the character says in Korean: \"{LINE}\"\n\n"
        "She glances to the side at the knock.\n"
        f"{E3_TAIL}"
    ),
    # natural-language timeline
    "E3-N": (
        f"{E3_HEAD}\n\n"
        "At 1 second, there is a loud knock on the door off-screen, and she glances to the side.\n"
        f"At 4 seconds, the character says in Korean: \"{LINE}\"\n\n"
        f"{E3_TAIL}"
    ),
    # supplied dialogue audio (knock @1.00 s + TTS line onset @4.00 s)
    "E3-A": (
        f"{E3_HEAD}\n\n"
        "@Audio1 provides the knock sound and the spoken dialogue with their exact timing. "
        "When the knock is heard she glances to the side. "
        "The character in @Image1 lip-syncs naturally to the Korean dialogue in @Audio1.\n\n"
        f"{E3_TAIL}"
    ),
}

if __name__ == "__main__":
    import json
    print(json.dumps({**E1, **E2, **E3}, ensure_ascii=False, indent=1))
