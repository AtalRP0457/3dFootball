// Modern Football (2024): European national team squads (Euro 2024 / autumn
// 2024 Nations League call-ups). Format: see modern-eng.ts. Shirt numbers are
// tournament numbers where known.
import type { RosterSource } from '../../../types/db.ts';

const rosters: RosterSource = {
  'n-fra': `Mike Maignan|GK|87|16|FRA
Brice Samba|GK|80|23|FRA
William Saliba|CB|87|17|FRA
Dayot Upamecano|CB|83|4|FRA
Ibrahima Konaté|CB|83|24|FRA
Jules Koundé|RB|85|5|FRA
Theo Hernández|LB|86|22|FRA|L|93
Ferland Mendy|LB|82|3|FRA|L
Aurélien Tchouaméni|CDM|85|8|FRA
N'Golo Kanté|CDM|83|13|FRA
Eduardo Camavinga|CM|84|6|FRA|L
Adrien Rabiot|CM|82|14|FRA|L
Antoine Griezmann|CF|87|7|FRA|L
Ousmane Dembélé|RW|85|11|FRA|L|93
Bradley Barcola|LW|79|25|FRA|R|91
Kingsley Coman|LW|83|20|FRA|R|91
Kylian Mbappé|ST|91|10|FRA|R|97
Marcus Thuram|ST|84|15|FRA
Randal Kolo Muani|ST|81|12|FRA`,
  'n-eng': `Jordan Pickford|GK|83|1|ENG|L
Aaron Ramsdale|GK|78|13|ENG
John Stones|CB|85|5|ENG
Marc Guéhi|CB|82|6|ENG
Ezri Konsa|CB|80|14|ENG
Kyle Walker|RB|84|2|ENG|R|86
Trent Alexander-Arnold|RB|86|8|ENG
Kieran Trippier|LB|80|12|ENG
Luke Shaw|LB|80|3|ENG|L
Declan Rice|CDM|87|4|ENG
Kobbie Mainoo|CM|80|26|ENG
Conor Gallagher|CM|81|16|ENG
Jude Bellingham|CAM|90|10|ENG
Phil Foden|RW|88|11|ENG|L
Cole Palmer|RW|86|24|ENG|L
Bukayo Saka|RW|88|7|ENG|L|87
Anthony Gordon|LW|81|18|ENG|R|90
Harry Kane|ST|90|9|ENG
Ollie Watkins|ST|84|19|ENG|R|86`,
  'n-esp': `Unai Simón|GK|85|23|ESP
David Raya|GK|86|1|ESP
Robin Le Normand|CB|82|3|ESP
Aymeric Laporte|CB|83|14|ESP|L
Dani Vivian|CB|80|5|ESP
Dani Carvajal|RB|86|2|ESP
Marc Cucurella|LB|80|24|ESP|L
Alejandro Grimaldo|LB|84|12|ESP|L
Rodri|CDM|91|16|ESP
Martín Zubimendi|CDM|84|18|ESP
Fabián Ruiz|CM|84|8|ESP|L
Pedri|CM|86|20|ESP
Dani Olmo|CAM|84|10|ESP
Mikel Merino|CM|82|6|ESP|L
Lamine Yamal|RW|85|19|ESP|L|88
Nico Williams|LW|85|17|ESP|R|93
Ferran Torres|LW|78|11|ESP
Álvaro Morata|ST|81|7|ESP
Mikel Oyarzabal|ST|82|21|ESP|L`,
  'n-ger': `Marc-André ter Stegen|GK|88|22|GER
Manuel Neuer|GK|86|1|GER
Antonio Rüdiger|CB|88|2|GER
Jonathan Tah|CB|85|4|GER
Nico Schlotterbeck|CB|82|15|GER|L
Joshua Kimmich|RB|86|6|GER
David Raum|LB|80|3|GER|L
Maximilian Mittelstädt|LB|79|18|GER|L
Robert Andrich|CDM|81|23|GER
Pascal Groß|CM|81|5|GER
Aleksandar Pavlović|CM|78|20|GER|L
İlkay Gündoğan|CM|84|21|GER
Jamal Musiala|CAM|87|10|GER
Florian Wirtz|CAM|88|17|GER
Leroy Sané|RW|84|19|GER|L|90
Serge Gnabry|RW|81|7|GER
Kai Havertz|ST|83|9|GER|L
Niclas Füllkrug|ST|79|11|GER
Deniz Undav|ST|79|26|GER`,
  'n-por': `Diogo Costa|GK|84|22|POR
Rui Patrício|GK|76|1|POR
Rúben Dias|CB|89|4|POR
Pepe|CB|78|3|POR
António Silva|CB|78|24|POR
Gonçalo Inácio|CB|80|14|POR|L
João Cancelo|RB|84|20|POR
Nuno Mendes|LB|82|19|POR|L|91
Diogo Dalot|RB|81|5|POR
João Palhinha|CDM|84|6|POR
Vitinha|CM|84|23|POR
Bruno Fernandes|CAM|87|8|POR
Bernardo Silva|CAM|88|10|POR|L
João Neves|CM|80|15|POR
Rafael Leão|LW|86|17|POR|R|94
Pedro Neto|RW|80|18|POR|L|89
Francisco Conceição|RW|77|26|POR|L
Diogo Jota|ST|83|21|POR
Cristiano Ronaldo|ST|86|7|POR
Gonçalo Ramos|ST|79|9|POR`,
  'n-ned': `Bart Verbruggen|GK|77|1|NED
Mark Flekken|GK|79|13|NED
Virgil van Dijk|CB|89|4|NED
Stefan de Vrij|CB|81|6|NED
Matthijs de Ligt|CB|83|3|NED
Micky van de Ven|CB|82|15|NED|L|94
Nathan Aké|CB|83|5|NED|L
Denzel Dumfries|RB|82|22|NED
Jeremie Frimpong|RB|82|12|NED|R|94
Jerdy Schouten|CDM|80|24|NED
Tijjani Reijnders|CM|82|14|NED
Joey Veerman|CM|79|16|NED
Frenkie de Jong|CM|86|21|NED
Xavi Simons|CAM|84|7|NED
Teun Koopmeiners|CAM|83|20|NED|L
Cody Gakpo|LW|82|11|NED
Donyell Malen|RW|80|18|NED
Memphis Depay|ST|80|10|NED
Wout Weghorst|ST|76|9|NED
Brian Brobbey|ST|78|19|NED`,
  'n-ita': `Gianluigi Donnarumma|GK|87|1|ITA
Guglielmo Vicario|GK|84|26|ITA
Alessandro Bastoni|CB|87|23|ITA|L
Riccardo Calafiori|CB|80|5|ITA|L
Federico Gatti|CB|79|4|ITA
Gianluca Mancini|CB|80|19|ITA
Alessandro Buongiorno|CB|81|15|ITA|L
Giovanni Di Lorenzo|RB|83|2|ITA
Federico Dimarco|LB|84|3|ITA|L
Destiny Udogie|LB|79|13|ITA|L
Jorginho|CDM|78|8|ITA
Nicolò Barella|CM|87|18|ITA
Davide Frattesi|CM|80|7|ITA
Sandro Tonali|CM|81|6|ITA
Samuele Ricci|CDM|78|16|ITA
Lorenzo Pellegrini|CAM|80|10|ITA
Federico Chiesa|RW|79|14|ITA
Mattia Zaccagni|LW|80|20|ITA
Mateo Retegui|ST|80|9|ITA
Moise Kean|ST|78|11|ITA`,
  'n-bel': `Koen Casteels|GK|81|1|BEL
Matz Sels|GK|79|13|BEL
Wout Faes|CB|75|4|BEL
Jan Vertonghen|CB|78|5|BEL|L
Arthur Theate|CB|77|3|BEL|L
Zeno Debast|CB|74|2|BEL
Timothy Castagne|RB|75|21|BEL
Maxim De Cuyper|LB|74|15|BEL|L
Amadou Onana|CDM|80|24|BEL
Orel Mangala|CM|74|18|BEL
Youri Tielemans|CM|81|8|BEL
Kevin De Bruyne|CAM|90|7|BEL
Charles De Ketelaere|CAM|80|17|BEL|L
Jérémy Doku|LW|81|22|BEL|R|93
Leandro Trossard|LW|81|9|BEL
Johan Bakayoko|RW|76|14|BEL|L
Dodi Lukébakio|RW|78|11|BEL|L
Romelu Lukaku|ST|83|10|BEL|L
Loïs Openda|ST|81|20|BEL|R|92`,
  'n-cro': `Dominik Livaković|GK|82|1|CRO
Ivica Ivušić|GK|73|23|CRO
Joško Gvardiol|CB|85|4|CRO|L
Josip Šutalo|CB|78|6|CRO
Martin Erlić|CB|75|5|CRO
Josip Stanišić|RB|78|2|CRO
Borna Sosa|LB|73|19|CRO|L
Marcelo Brozović|CDM|82|11|CRO
Mateo Kovačić|CM|83|8|CRO
Luka Modrić|CM|86|10|CRO
Mario Pašalić|CAM|79|15|CRO
Lovro Majer|CAM|78|7|CRO|L
Luka Sučić|CM|76|13|CRO
Ivan Perišić|LM|78|14|CRO
Ante Budimir|ST|78|17|CRO
Andrej Kramarić|ST|80|9|CRO
Marco Pašalić|RW|72|22|CRO
Petar Sučić|CM|72|20|CRO`,
  'n-sui': `Yann Sommer|GK|86|1|SUI
Gregor Kobel|GK|86|21|SUI
Manuel Akanji|CB|84|5|SUI
Fabian Schär|CB|80|22|SUI
Nico Elvedi|CB|78|4|SUI
Ricardo Rodríguez|CB|74|13|SUI|L
Silvan Widmer|RB|74|3|SUI
Granit Xhaka|CDM|85|10|SUI|L
Remo Freuler|CM|78|8|SUI
Denis Zakaria|CDM|79|6|SUI
Michel Aebischer|LWB|75|20|SUI
Fabian Rieder|CAM|75|17|SUI|L
Xherdan Shaqiri|CAM|76|23|SUI|L
Ruben Vargas|LW|76|2|SUI
Dan Ndoye|RW|76|11|SUI
Breel Embolo|ST|77|7|SUI
Zeki Amdouni|ST|74|9|SUI
Noah Okafor|ST|74|19|SUI`,
  'n-den': `Kasper Schmeichel|GK|80|1|DEN
Frederik Rønnow|GK|76|16|DEN
Andreas Christensen|CB|80|6|DEN
Joachim Andersen|CB|80|2|DEN
Jannik Vestergaard|CB|74|3|DEN
Victor Kristiansen|LB|72|5|DEN|L
Joakim Mæhle|RB|76|17|DEN
Alexander Bah|RB|74|18|DEN
Pierre-Emile Højbjerg|CDM|80|23|DEN
Morten Hjulmand|CDM|80|21|DEN
Christian Eriksen|CM|80|10|DEN
Christian Nørgaard|CM|77|8|DEN
Mikkel Damsgaard|CAM|76|14|DEN
Andreas Skov Olsen|RW|76|11|DEN|L
Jonas Wind|ST|74|19|DEN
Rasmus Højlund|ST|78|9|DEN
Yussuf Poulsen|ST|74|20|DEN
Kasper Dolberg|ST|73|12|DEN`,
  'n-swe': `Robin Olsen|GK|71|1|SWE
Viktor Johansson|GK|72|12|SWE
Victor Lindelöf|CB|78|4|SWE
Isak Hien|CB|77|3|SWE
Carl Starfelt|CB|75|5|SWE
Emil Holm|RB|74|2|SWE
Gabriel Gudmundsson|LB|74|6|SWE|L
Jens Cajuste|CM|72|8|SWE
Mattias Svanberg|CM|74|20|SWE
Hugo Larsson|CM|74|16|SWE
Lucas Bergvall|CM|72|21|SWE
Dejan Kulusevski|RW|82|10|SWE|L
Anthony Elanga|RW|77|11|SWE|R|91
Emil Forsberg|LW|75|7|SWE
Yasin Ayari|CM|73|15|SWE
Alexander Isak|ST|85|9|SWE|R|88
Viktor Gyökeres|ST|84|17|SWE
Jesper Karlström|CDM|74|14|SWE`,
  'n-nor': `Ørjan Nyland|GK|76|1|NOR
Egil Selvik|GK|70|12|NOR
Kristoffer Ajer|CB|75|3|NOR
Leo Østigård|CB|75|4|NOR
Andreas Hanche-Olsen|CB|72|5|NOR
Julian Ryerson|RB|77|14|NOR
David Møller Wolfe|LB|72|23|NOR|L
Sander Berge|CDM|76|8|NOR
Patrick Berg|CDM|73|6|NOR
Martin Ødegaard|CAM|89|10|NOR|L
Kristian Thorstvedt|CM|73|16|NOR
Fredrik Aursnes|CM|78|20|NOR|L
Antonio Nusa|LW|74|11|NOR|R|90
Oscar Bobb|RW|73|19|NOR|L
Jørgen Strand Larsen|ST|76|9|NOR
Alexander Sørloth|ST|81|7|NOR
Erling Haaland|ST|91|18|NOR|L|89
Mohamed Elyounoussi|LW|72|17|NOR`,
  'n-pol': `Wojciech Szczęsny|GK|84|1|POL
Łukasz Skorupski|GK|78|12|POL
Jan Bednarek|CB|73|5|POL
Jakub Kiwior|CB|75|14|POL|L
Paweł Dawidowicz|CB|73|3|POL
Przemysław Frankowski|RWB|75|19|POL
Nicola Zalewski|LWB|74|21|POL|L
Matty Cash|RB|78|2|POL
Taras Romanczuk|CDM|72|16|POL
Jakub Moder|CM|73|8|POL
Piotr Zieliński|CM|80|20|POL
Sebastian Szymański|CAM|76|10|POL
Kacper Urbański|CAM|70|23|POL
Jakub Piotrowski|CM|72|22|POL
Robert Lewandowski|ST|88|9|POL
Krzysztof Piątek|ST|73|4|POL
Karol Świderski|ST|73|11|POL
Adam Buksa|ST|72|7|POL`,
  'n-srb': `Predrag Rajković|GK|77|1|SRB
Vanja Milinković-Savić|GK|78|23|SRB
Nikola Milenković|CB|80|4|SRB
Strahinja Pavlović|CB|76|13|SRB|L
Miloš Veljković|CB|72|15|SRB
Andrija Živković|RWB|74|14|SRB|L
Filip Mladenović|LWB|72|17|SRB|L
Nemanja Gudelj|CDM|76|6|SRB
Saša Lukić|CM|75|16|SRB
Sergej Milinković-Savić|CM|82|20|SRB
Ivan Ilić|CM|76|22|SRB|L
Dušan Tadić|CAM|78|10|SRB|L
Lazar Samardžić|CAM|76|21|SRB|L
Dušan Vlahović|ST|83|9|SRB|L
Aleksandar Mitrović|ST|80|18|SRB
Luka Jović|ST|74|8|SRB
Filip Kostić|LWB|76|11|SRB|L
Veljko Birmančević|LW|72|19|SRB`,
  'n-tur': `Mert Günok|GK|76|1|TUR
Uğurcan Çakır|GK|79|23|TUR
Merih Demiral|CB|78|3|TUR
Abdülkerim Bardakcı|CB|76|14|TUR|L
Samet Akaydin|CB|74|4|TUR
Zeki Çelik|RB|75|2|TUR
Ferdi Kadıoğlu|LB|79|20|TUR|L
Mert Müldür|RB|74|18|TUR
Hakan Çalhanoğlu|CDM|86|10|TUR
Kaan Ayhan|CDM|75|22|TUR
Orkun Kökçü|CM|80|6|TUR
İsmail Yüksek|CDM|74|16|TUR
Arda Güler|CAM|77|8|TUR|L
Kenan Yıldız|LW|77|19|TUR
Kerem Aktürkoğlu|LW|78|7|TUR
Barış Alper Yılmaz|RW|77|21|TUR
Cengiz Ünder|RW|75|17|TUR|L
Yusuf Yazıcı|CAM|74|11|TUR`,
  'n-aut': `Patrick Pentz|GK|74|13|AUT
Alexander Schlager|GK|74|1|AUT
Kevin Danso|CB|78|4|AUT
Philipp Lienhart|CB|76|15|AUT
Gernot Trauner|CB|74|3|AUT
Stefan Posch|RB|75|5|AUT
Phillipp Mwene|LB|73|16|AUT|L
Maximilian Wöber|LB|74|2|AUT|L
Nicolas Seiwald|CDM|75|6|AUT
Konrad Laimer|CM|82|20|AUT
Marcel Sabitzer|CM|81|9|AUT
Christoph Baumgartner|CAM|78|19|AUT
Florian Grillitsch|CM|74|10|AUT
Romano Schmid|CAM|74|18|AUT
Patrick Wimmer|RW|74|17|AUT
Marko Arnautović|ST|75|7|AUT
Michael Gregoritsch|ST|74|11|AUT|L
David Alaba|CB|84|8|AUT|L`,
  'n-sco': `Angus Gunn|GK|74|1|SCO
Zander Clark|GK|70|12|SCO
Grant Hanley|CB|72|5|SCO
Scott McKenna|CB|72|15|SCO|L
Kieran Tierney|CB|76|6|SCO|L
Jack Hendry|CB|72|13|SCO
Anthony Ralston|RB|71|2|SCO
Andrew Robertson|LB|84|3|SCO|L
Billy Gilmour|CM|75|14|SCO
Callum McGregor|CM|78|4|SCO
Scott McTominay|CM|80|7|SCO
John McGinn|CAM|80|11|SCO|L
Ryan Christie|CAM|74|10|SCO
Kenny McLean|CM|72|23|SCO|L
Ché Adams|ST|74|8|SCO
Lyndon Dykes|ST|71|9|SCO
Lawrence Shankland|ST|71|19|SCO
Ben Doak|RW|69|17|SCO|R|90`,
  'n-wal': `Danny Ward|GK|72|1|WAL
Karl Darlow|GK|71|12|WAL
Joe Rodon|CB|74|6|WAL
Ben Davies|CB|76|4|WAL|L
Chris Mepham|CB|71|5|WAL
Ethan Ampadu|CDM|74|15|WAL
Neco Williams|RB|74|3|WAL
Connor Roberts|RB|72|14|WAL
Jordan James|CM|71|18|WAL
Joe Allen|CM|72|7|WAL|L
Harry Wilson|RW|74|8|WAL|L
Brennan Johnson|RW|78|20|WAL|R|88
Daniel James|LW|74|10|WAL|R|91
David Brooks|CAM|72|16|WAL|L
Kieffer Moore|ST|71|13|WAL
Mark Harris|ST|68|9|WAL
Sorba Thomas|LW|68|21|WAL|L
Wes Burns|RW|69|11|WAL`,
  'n-ukr': `Anatoliy Trubin|GK|80|12|UKR
Andriy Lunin|GK|80|1|UKR
Illia Zabarnyi|CB|78|13|UKR
Mykola Matviyenko|CB|76|22|UKR|L
Maksym Talovierov|CB|70|4|UKR
Yukhym Konoplya|RB|72|2|UKR
Oleksandr Zinchenko|LB|78|17|UKR|L
Vitaliy Mykolenko|LB|76|16|UKR|L
Taras Stepanenko|CDM|72|6|UKR
Ruslan Malinovskyi|CM|74|8|UKR|L
Heorhiy Sudakov|CAM|76|10|UKR
Mykola Shaparenko|CM|74|19|UKR
Volodymyr Brazhko|CDM|71|18|UKR
Mykhailo Mudryk|LW|76|3|UKR|R|94
Viktor Tsygankov|RW|79|15|UKR|L
Oleksandr Zubkov|RW|72|20|UKR
Artem Dovbyk|ST|81|11|UKR|L
Roman Yaremchuk|ST|73|9|UKR`,
  'n-cze': `Jindřich Staněk|GK|76|1|CZE
Matěj Kovář|GK|74|16|CZE
Ladislav Krejčí|CB|75|18|CZE
Robin Hranáč|CB|72|3|CZE
Tomáš Holeš|CB|73|5|CZE
Vladimír Coufal|RB|74|2|CZE
David Jurásek|LB|72|17|CZE|L
Tomáš Souček|CM|78|15|CZE
Lukáš Provod|CM|74|14|CZE|L
Antonín Barák|CAM|74|7|CZE
Ondřej Lingr|CM|71|21|CZE
Václav Černý|RW|74|19|CZE|L
Adam Hložek|ST|74|9|CZE
Patrik Schick|ST|80|10|CZE|L
Mojmír Chytil|ST|71|13|CZE
Tomáš Chorý|ST|71|20|CZE
Michal Sadílek|CM|72|22|CZE
Pavel Šulc|CAM|71|11|CZE`,
  'n-hun': `Péter Gulácsi|GK|80|1|HUN
Dénes Dibusz|GK|73|12|HUN
Willi Orbán|CB|79|6|HUN
Attila Szalai|CB|75|4|HUN|L
Ádám Lang|CB|71|2|HUN
Loïc Négo|RWB|72|7|HUN
Milos Kerkez|LWB|77|11|HUN|L
Bendegúz Bolla|RWB|71|14|HUN
Ádám Nagy|CDM|72|8|HUN
András Schäfer|CM|74|13|HUN
Callum Styles|CM|72|15|HUN|L
Dominik Szoboszlai|CAM|81|10|HUN
Roland Sallai|RW|76|20|HUN
Barnabás Varga|ST|74|19|HUN
Martin Ádám|ST|70|9|HUN
Dániel Gazdag|CAM|72|16|HUN
Kevin Csoboth|LW|70|17|HUN
Zsolt Nagy|LWB|71|5|HUN|L`,
  'n-irl': `Caoimhín Kelleher|GK|79|1|IRL
Gavin Bazunu|GK|72|23|IRL
Nathan Collins|CB|77|4|IRL
Dara O'Shea|CB|73|5|IRL
Liam Scales|CB|71|15|IRL|L
John Egan|CB|72|6|IRL
Seamus Coleman|RB|71|2|IRL
Matt Doherty|RB|72|22|IRL
Robbie Brady|LB|70|11|IRL|L
Josh Cullen|CDM|72|13|IRL
Jason Knight|CM|71|8|IRL
Jayson Molumby|CM|70|16|IRL
Will Smallbone|CM|71|21|IRL
Chiedozie Ogbene|RW|71|20|IRL|R|91
Sammie Szmodics|CAM|72|10|IRL
Mikey Johnston|LW|70|17|IRL
Evan Ferguson|ST|74|9|IRL
Troy Parrott|ST|71|19|IRL`,
  'n-gre': `Odisseas Vlachodimos|GK|75|1|GRE
Konstantinos Tzolakis|GK|73|13|GRE
Konstantinos Mavropanos|CB|75|4|GRE
Pantelis Hatzidiakos|CB|74|5|GRE
Konstantinos Koulierakis|CB|72|14|GRE|L
Lazaros Rota|RB|71|2|GRE
Kostas Tsimikas|LB|76|21|GRE|L
Manolis Siopis|CDM|72|6|GRE
Dimitris Kourbelis|CDM|71|8|GRE
Petros Mantalos|CAM|72|10|GRE
Christos Tzolis|LW|76|11|GRE
Dimitris Pelkas|CAM|72|20|GRE|L
Giorgos Masouras|RW|72|7|GRE
Fotis Ioannidis|ST|74|19|GRE
Anastasios Bakasetas|CAM|72|9|GRE|L
Vangelis Pavlidis|ST|78|3|GRE
Giannis Konstantelias|CAM|71|17|GRE
Anastasios Douvikas|ST|72|22|GRE`,
};

export default rosters;
