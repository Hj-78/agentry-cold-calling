export interface EmailTemplate {
  id: string
  nom: string
  sujet: string
  corps: string
  objection: string
}

const SIGNATURE = `<br><br><hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
<p style="margin:0;font-size:14px;color:#334155"><strong>{{expediteur}}</strong><br>
<span style="color:#6366f1;font-weight:700;font-size:15px;letter-spacing:0.5px">Agentry</span><br>
<span style="color:#94a3b8;font-size:12px">Développement &amp; Prospection Immobilière</span></p>`

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'presentation',
    nom: '📋 Présentation suite à un appel',
    objection: 'Envoyez-moi un mail',
    sujet: 'Suite à notre échange – {{agence}}',
    corps: `<p style="color:#0f172a">Bonjour,</p>

<p>Comme convenu lors de notre conversation téléphonique, je me permets de vous adresser quelques éléments de présentation.</p>

<p>Pour vous situer rapidement : j'accompagne des agences immobilières dans le développement de leur activité, notamment sur la partie <strong>acquisition de mandats exclusifs</strong> et la génération de contacts vendeurs qualifiés. L'idée est simple — vous concentrer sur ce que vous faites le mieux (la transaction), pendant que nous gérons la prospection en amont.</p>

<p>Concrètement, voici ce que nous apportons à nos partenaires agences :</p>
<ul style="line-height:2.2;padding-left:20px">
  <li><strong>Des contacts vendeurs qualifiés</strong>, exclusifs et géolocalisés sur votre secteur</li>
  <li><strong>Un accompagnement terrain</strong> sur les techniques de prise de mandat</li>
  <li><strong>Des outils de suivi</strong> pour ne jamais laisser passer une opportunité</li>
</ul>

<p>Plusieurs agences de votre secteur travaillent déjà avec nous et constatent une <strong>augmentation significative de leur taux de rentrants</strong> — je serais heureux de vous partager des retours concrets.</p>

<p>Seriez-vous disponible pour un échange de <strong>15 à 20 minutes</strong> cette semaine ou la semaine prochaine, en visio ou par téléphone ? Je m'adapte entièrement à vos disponibilités.</p>

<p>Dans l'attente de votre retour, je reste à votre disposition.</p>${SIGNATURE}`,
  },
  {
    id: 'rdv-confirmation',
    nom: '📅 Confirmation de rendez-vous (auto)',
    objection: 'Suite à un RDV pris',
    sujet: '✅ Rendez-vous confirmé – {{agence}} – {{rdvDate}}',
    corps: `<p>Bonjour,</p>

<p>Je vous confirme notre rendez-vous prévu le <strong>{{rdvDate}} à {{rdvHeure}}</strong> et je m'en réjouis.</p>

<p>Pour vous rappeler le contexte de notre échange de ce jour :</p>
<blockquote style="border-left:3px solid #6366f1;margin:16px 0;padding:12px 16px;background:#f8fafc;color:#475569;font-style:italic">
  {{resumeAppel}}
</blockquote>

{{meetLink}}

<p>Lors de notre rendez-vous, nous aborderons concrètement :</p>
<ul style="line-height:2.2;padding-left:20px">
  <li>Votre activité actuelle et vos objectifs de développement sur {{agence}}</li>
  <li>Comment nous générons des mandats exclusifs sur votre secteur</li>
  <li>Des exemples chiffrés d'agences partenaires comparables à la vôtre</li>
</ul>

<p>Notre échange durera environ <strong>20 à 30 minutes</strong>. N'hésitez pas à me faire signe si vous avez des questions d'ici là ou si vous souhaitez modifier le créneau.</p>

<p>À très bientôt,</p>${SIGNATURE}`,
  },
  {
    id: 'suivi',
    nom: '🔁 Relance après un premier contact',
    objection: 'Rappeler plus tard / Pas le bon moment',
    sujet: 'Relance – {{agence}}',
    corps: `<p>Bonjour,</p>

<p>Je me permets de revenir vers vous suite à notre échange de la semaine dernière.</p>

<p>Je sais que le quotidien d'une agence est chargé et que les priorités s'enchaînent — c'est précisément pour ça que je souhaitais reprendre contact avant que l'information ne se perde.</p>

<p>Pour rappel, je travaille avec des agences comme la vôtre pour générer davantage de <strong>mandats exclusifs</strong> grâce à une approche de prospection structurée. Les résultats sont concrets et mesurables dès les premières semaines.</p>

<p>Si vous avez quelques minutes cette semaine, je serais ravi de vous présenter comment cela fonctionne précisément — sans engagement, juste pour voir si c'est pertinent pour <strong>{{agence}}</strong>.</p>

<p>Un simple "oui" en réponse à cet email suffit pour qu'on fixe un créneau.</p>${SIGNATURE}`,
  },
  {
    id: 'objection-concurrent',
    nom: '🏆 Réponse à "On a déjà quelqu\'un"',
    objection: 'On travaille déjà avec quelqu\'un',
    sujet: 'Et si on comparait ? – {{agence}}',
    corps: `<p>Bonjour,</p>

<p>Je vous remercie pour votre franchise lors de notre échange — c'est toujours appréciable.</p>

<p>Je comprends parfaitement que vous travailliez déjà avec un prestataire, et je n'ai absolument pas l'intention de vous demander de changer quoi que ce soit sans raison valable.</p>

<p>Ce qui m'a poussé à vous écrire, c'est simplement ceci : <strong>nos clients qui travaillaient déjà avec d'autres solutions ont, dans la grande majorité des cas, constaté des résultats supérieurs avec notre approche</strong> — notamment sur la qualité des contacts vendeurs et la rapidité d'obtention de mandats.</p>

<p>Je ne vous demande pas de prendre une décision aujourd'hui. Je vous propose simplement un échange de <strong>15 minutes</strong> pour vous montrer concrètement la différence — et vous laisserez votre propre jugement décider.</p>

<p>Est-ce que vous seriez ouvert à ce type d'échange dans les prochains jours ?</p>${SIGNATURE}`,
  },
  {
    id: 'pas-interesse',
    nom: '💡 Réponse à "Pas intéressé"',
    objection: 'Pas intéressé',
    sujet: 'Je respecte votre décision – {{agence}}',
    corps: `<p>Bonjour,</p>

<p>Merci pour votre retour direct — je le respecte tout à fait.</p>

<p>Je ne souhaite pas vous importuner davantage. Permettez-moi simplement de vous laisser mes coordonnées, car les contextes évoluent, et il n'est pas rare que des agences qui n'étaient pas intéressées dans un premier temps reviennent vers nous quelques mois plus tard, une fois confrontées à des périodes creuses ou à un manque de rentrants.</p>

<p>Si un jour vous souhaitez explorer de nouvelles pistes pour développer votre portefeuille de mandats, je serai là.</p>

<p>Je vous souhaite une très bonne continuation,</p>${SIGNATURE}`,
  },
  {
    id: 'messagerie',
    nom: '📞 Suite à une messagerie',
    objection: 'Messagerie / Absent',
    sujet: 'Suite à mon message – {{agence}}',
    corps: `<p>Bonjour,</p>

<p>Je vous ai laissé un message vocal ce jour et je complète par écrit pour vous faciliter le retour.</p>

<p>En quelques mots : j'accompagne des agences immobilières dans le développement de leur activité, notamment sur la <strong>génération de mandats exclusifs</strong> et la prospection vendeurs. Je travaille avec plusieurs agences de votre secteur avec de très bons résultats.</p>

<p>Je souhaitais simplement vous présenter notre approche en <strong>15 minutes</strong> — sans engagement — pour voir si cela peut être pertinent pour {{agence}}.</p>

<p>Vous pouvez me rappeler directement ou simplement répondre à cet email pour qu'on fixe un créneau qui vous convient.</p>${SIGNATURE}`,
  },
]
