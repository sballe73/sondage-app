/**
 * Validation du formulaire de vote (partagée avec les tests d'intégration).
 */
(function (root) {
  function buildIncompleteVoteMessage(missingLabels) {
    if (!missingLabels.length) return "";
    if (missingLabels.length === 1) {
      return (
        "Attribuez une note à « " + missingLabels[0] + " » avant d’envoyer."
      );
    }
    return (
      "Attribuez une note à chaque candidat (" +
      missingLabels.length +
      " manquants)."
    );
  }

  function validateVoteGrades(items, gradeForItem) {
    const missing = [];
    const grades = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const grade = gradeForItem(item.id);
      if (grade == null || Number.isNaN(grade)) {
        missing.push(item.label);
      } else {
        grades.push({ itemId: item.id, grade: grade });
      }
    }
    return {
      ok: missing.length === 0,
      missing: missing,
      grades: grades,
      message: buildIncompleteVoteMessage(missing),
    };
  }

  root.SondageVoteFormValidate = {
    buildIncompleteVoteMessage: buildIncompleteVoteMessage,
    validateVoteGrades: validateVoteGrades,
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
