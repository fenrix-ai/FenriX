"""Minimal OLS with standard errors / t / approximate p-values (normal approx, fine at df>60)."""
import numpy as np


def ols(X, y, names=None):
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    n, p = X.shape
    Xd = np.column_stack([np.ones(n), X])
    beta, *_ = np.linalg.lstsq(Xd, y, rcond=None)
    resid = y - Xd @ beta
    dof = max(n - (p + 1), 1)
    sigma2 = resid @ resid / dof
    cov = sigma2 * np.linalg.pinv(Xd.T @ Xd)
    se = np.sqrt(np.diag(cov))
    t = beta / np.where(se == 0, np.inf, se)
    pvals = 2 * (1 - _phi(np.abs(t)))
    ss_tot = ((y - y.mean()) ** 2).sum()
    r2 = 1 - (resid @ resid) / ss_tot if ss_tot > 0 else 0.0
    labels = ["intercept"] + (names or [f"x{i}" for i in range(p)])
    return dict(beta=dict(zip(labels, beta)), se=dict(zip(labels, se)),
                t=dict(zip(labels, t)), p=dict(zip(labels, pvals)), r2=float(r2))


def _phi(z):
    return 0.5 * (1 + np.vectorize(_erf)(z / np.sqrt(2)))


def _erf(x):
    # Abramowitz & Stegun 7.1.26
    sign = 1 if x >= 0 else -1
    x = abs(x)
    a1, a2, a3, a4, a5, q = 0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429, 0.3275911
    t = 1.0 / (1.0 + q * x)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * np.exp(-x * x)
    return sign * y


def pearson_r(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    return float(np.corrcoef(a, b)[0, 1])
