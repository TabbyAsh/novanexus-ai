"""
NOVA LABS — PX quantum track (Spec v0.2 §5). Honest scope, stated in code:

Hybrid quantum-classical ML on small structured Nova data. In 2026 this runs
on classical simulators; NO quantum advantage exists for Nova's workloads and
none is claimed here. The promotion condition is unforgiving: a QML model
earns nothing unless it beats a tuned classical baseline on a real Nova task
on held-out data. Until then this is research, budgeted as research — and
the founder builds fluency early.

Task: regime classification (EXPLOITATION vs EXPLORATION) over Candle-style
state vectors — feature dimensionality small enough for near-term circuits.

Run locally:  pip install pennylane scikit-learn && python regime_qml_experiment.py
Register the result as a Decision Card either way (beat-baseline or archive).
"""

import json
import random
import sys

FEATURES = ["market_open", "spy_change_pct", "artifacts_24h_norm", "agents_active_norm", "mind_available"]


def synthetic_candles(n=200, seed=7):
    """Placeholder data until enough real Candle vectors accumulate on the
    substrate. Replace with an export of artifacts once volume exists —
    the harness stays identical."""
    random.seed(seed)
    xs, ys = [], []
    for _ in range(n):
        x = [random.random() for _ in FEATURES]
        # exploitation days: market open, calm SPY, steady activity
        y = 1 if (x[0] > 0.5 and abs(x[1] - 0.5) < 0.2) else 0
        if random.random() < 0.12:
            y = 1 - y  # honest noise
        xs.append(x)
        ys.append(y)
    return xs, ys


def classical_baseline(xtr, ytr, xte, yte):
    from sklearn.linear_model import LogisticRegression
    m = LogisticRegression(max_iter=500).fit(xtr, ytr)
    return m.score(xte, yte)


def quantum_model(xtr, ytr, xte, yte):
    import pennylane as qml
    from pennylane import numpy as np

    n_qubits = len(FEATURES)
    dev = qml.device("default.qubit", wires=n_qubits)

    @qml.qnode(dev)
    def circuit(weights, x):
        qml.AngleEmbedding(x, wires=range(n_qubits))
        qml.BasicEntanglerLayers(weights, wires=range(n_qubits))
        return qml.expval(qml.PauliZ(0))

    weights = np.random.uniform(0, 3.14, (2, n_qubits), requires_grad=True)
    opt = qml.GradientDescentOptimizer(0.3)

    def cost(w):
        preds = [(1 - circuit(w, x)) / 2 for x in xtr]
        return sum((p - y) ** 2 for p, y in zip(preds, ytr)) / len(ytr)

    for _ in range(40):
        weights = opt.step(cost, weights)

    correct = sum(1 for x, y in zip(xte, yte) if round(float((1 - circuit(weights, x)) / 2)) == y)
    return correct / len(yte)


if __name__ == "__main__":
    xs, ys = synthetic_candles()
    split = int(len(xs) * 0.7)
    xtr, ytr, xte, yte = xs[:split], ys[:split], xs[split:], ys[split:]

    baseline = classical_baseline(xtr, ytr, xte, yte)
    try:
        qml_acc = quantum_model(xtr, ytr, xte, yte)
    except ImportError:
        print(json.dumps({"error": "pennylane not installed — pip install pennylane"}))
        sys.exit(1)

    verdict = "PROMOTE" if qml_acc > baseline else "ARCHIVE_WITH_FINDINGS"
    print(json.dumps({
        "experiment": "regime_qml_v0",
        "classical_baseline_accuracy": round(baseline, 4),
        "qml_accuracy": round(qml_acc, 4),
        "verdict": verdict,
        "note": "Promotion requires beating the tuned classical baseline on REAL Candle data, held out. Synthetic runs never promote.",
    }, indent=2))
