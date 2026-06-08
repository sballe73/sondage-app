/**
 * Ordre d'affichage des candidats dans la grille de vote (partagé avec les tests).
 */
(function (root) {
  function shuffleItems(items, randomFn) {
    const random = randomFn || Math.random;
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  root.SondageVoteCandidateOrder = {
    shuffleItems: shuffleItems,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
