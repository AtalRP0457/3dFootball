// Modern Football (2024-25): Spain and Italy. Format: see modern-eng.ts.
import type { RosterSource } from '../../../types/db.ts';

const rosters: RosterSource = {
  fcb: `Marc-André ter Stegen|GK|88|1|GER
Iñaki Peña|GK|76|13|ESP
Ronald Araújo|CB|85|4|URU
Pau Cubarsí|CB|79|2|ESP
Iñigo Martínez|CB|80|5|ESP|L
Andreas Christensen|CB|80|15|DEN
Jules Koundé|RB|85|23|FRA
Alejandro Balde|LB|79|3|ESP|L|91
Marc Casadó|CDM|74|17|ESP
Frenkie de Jong|CM|86|21|NED
Pedri|CM|86|8|ESP
Gavi|CM|82|6|ESP
Marc Bernal|CDM|70|28|ESP
Dani Olmo|CAM|84|20|ESP
Fermín López|CAM|77|16|ESP
Lamine Yamal|RW|85|19|ESP|L|88
Raphinha|LW|84|11|BRA|L|89
Ferran Torres|LW|78|7|ESP
Robert Lewandowski|ST|88|9|POL`,
  rma: `Thibaut Courtois|GK|90|1|BEL
Andriy Lunin|GK|80|13|UKR
Antonio Rüdiger|CB|88|22|GER
Éder Militão|CB|86|3|BRA
David Alaba|CB|84|4|AUT|L
Jesús Vallejo|CB|70|18|ESP
Dani Carvajal|RB|86|2|ESP
Lucas Vázquez|RB|79|17|ESP
Ferland Mendy|LB|82|23|FRA|L
Fran García|LB|76|20|ESP|L
Aurélien Tchouaméni|CDM|85|14|FRA
Federico Valverde|CM|88|8|URU
Eduardo Camavinga|CM|84|6|FRA|L
Luka Modrić|CM|86|10|CRO
Dani Ceballos|CM|78|19|ESP
Jude Bellingham|CAM|90|5|ENG
Arda Güler|CAM|77|15|TUR|L
Vinícius Júnior|LW|90|7|BRA|R|95
Rodrygo|RW|85|11|BRA|R|89
Brahim Díaz|CAM|80|21|MAR
Kylian Mbappé|ST|91|9|FRA|R|97
Endrick|ST|74|16|BRA`,
  atm: `Jan Oblak|GK|88|13|SVN
Juan Musso|GK|77|1|ARG
José María Giménez|CB|83|2|URU
Robin Le Normand|CB|82|24|ESP
Clément Lenglet|CB|77|15|FRA|L
César Azpilicueta|CB|77|3|ESP
Axel Witsel|CB|77|20|BEL
Nahuel Molina|RB|80|16|ARG
Javi Galán|LB|76|21|ESP|L
Reinildo|LB|76|23|MOZ|L
Koke|CM|82|6|ESP
Rodrigo De Paul|CM|83|5|ARG
Conor Gallagher|CM|81|4|ENG
Pablo Barrios|CM|76|8|ESP
Marcos Llorente|RM|82|14|ESP
Samuel Lino|LM|76|12|BRA|L
Giuliano Simeone|RW|72|22|ARG
Antoine Griezmann|CF|87|7|FRA|L
Julián Álvarez|ST|85|19|ARG
Alexander Sørloth|ST|81|9|NOR
Ángel Correa|ST|79|10|ARG`,
  sev: `Ørjan Nyland|GK|76|13|NOR
Álvaro Fernández|GK|71|1|ESP
Loïc Badé|CB|78|22|FRA
Kike Salas|CB|74|4|ESP|L
Nemanja Gudelj|CB|76|6|SRB
Tanguy Nianzou|CB|72|24|FRA
José Ángel Carmona|RB|73|32|ESP
Juanlu Sánchez|RB|72|26|ESP
Adrià Pedrosa|LB|73|3|ESP|L
Djibril Sow|CM|76|20|SUI
Lucien Agoumé|CDM|74|18|FRA
Albert Sambi Lokonga|CM|73|12|BEL
Saúl Ñíguez|CM|76|17|ESP|L
Jesús Navas|RB|76|16|ESP
Dodi Lukébakio|RW|78|11|BEL|L
Chidera Ejuke|LW|74|21|NGA
Isaac Romero|ST|73|7|ESP
Kelechi Iheanacho|ST|73|9|NGA`,
  val: `Giorgi Mamardashvili|GK|82|25|GEO
Stole Dimitrievski|GK|72|1|MKD
Cristhian Mosquera|CB|76|3|ESP
César Tárrega|CB|73|5|ESP
Mouctar Diakhaby|CB|74|4|GUI
Dimitri Foulquier|RB|73|20|GUI
Thierry Correia|RB|72|12|POR
José Gayà|LB|80|14|ESP|L
Jesús Vázquez|LB|71|21|ESP|L
Pepelu|CDM|77|18|ESP
Javi Guerra|CM|76|8|ESP
Enzo Barrenechea|CM|73|6|ARG
André Almeida|CAM|74|10|POR
Diego López|LW|75|16|ESP|L
Luis Rioja|LW|74|22|ESP
Rafa Mir|ST|72|17|ESP
Hugo Duro|ST|75|9|ESP
Dani Gómez|ST|69|19|ESP`,
  vil: `Diego Conde|GK|76|13|ESP
Luiz Júnior|GK|72|1|BRA
Raúl Albiol|CB|77|3|ESP
Logan Costa|CB|74|2|CPV
Eric Bailly|CB|72|24|CIV
Juan Foyth|RB|78|8|ARG
Kiko Femenía|RB|73|17|ESP
Sergi Cardona|LB|75|23|ESP|L
Dani Parejo|CM|80|10|ESP
Santi Comesaña|CM|76|14|ESP
Pape Gueye|CDM|75|18|SEN
Álex Baena|LM|82|16|ESP|L
Yeremy Pino|RW|79|21|ESP
Ilias Akhomach|RW|73|11|MAR|L
Nicolas Pépé|RW|76|19|CIV|L
Ayoze Pérez|ST|79|22|ESP
Gerard Moreno|ST|80|7|ESP|L
Thierno Barry|ST|74|15|FRA`,
  ath: `Unai Simón|GK|85|1|ESP
Julen Agirrezabala|GK|73|13|ESP
Dani Vivian|CB|80|3|ESP
Yeray Álvarez|CB|77|5|ESP|L
Aitor Paredes|CB|74|4|ESP
Óscar de Marcos|RB|76|18|ESP
Andoni Gorosabel|RB|73|2|ESP
Yuri Berchiche|LB|76|17|ESP|L
Iñigo Lekue|RB|71|15|ESP
Oihan Sancet|CAM|81|8|ESP
Mikel Vesga|CDM|75|6|ESP
Beñat Prados|CM|74|24|ESP
Iñigo Ruiz de Galarreta|CM|76|16|ESP
Unai Gómez|CAM|71|20|ESP
Nico Williams|LW|85|10|ESP|R|93
Iñaki Williams|RW|80|9|GHA|R|91
Álex Berenguer|LW|76|7|ESP|L
Gorka Guruzeta|ST|76|12|ESP`,
  rso: `Álex Remiro|GK|83|1|ESP
Unai Marrero|GK|69|13|ESP
Igor Zubeldia|CB|80|5|ESP
Nayef Aguerd|CB|79|12|MAR|L
Jon Pacheco|CB|75|20|ESP|L
Jon Aramburu|RB|72|2|VEN
Hamari Traoré|RB|74|18|MLI
Aihen Muñoz|LB|74|3|ESP|L
Martín Zubimendi|CDM|84|4|ESP
Brais Méndez|CM|80|23|ESP|L
Luka Sučić|CM|76|24|CRO
Beñat Turrientes|CM|73|22|ESP
Sergio Gómez|LW|75|17|ESP|L
Takefusa Kubo|RW|82|14|JPN|L
Ander Barrenetxea|LW|77|7|ESP
Sheraldo Becker|LW|75|11|SUR
Mikel Oyarzabal|ST|82|10|ESP|L
Orri Óskarsson|ST|72|9|ISL`,
  bet: `Rui Silva|GK|79|13|POR
Adrián|GK|72|1|ESP
Marc Bartra|CB|76|5|ESP
Diego Llorente|CB|76|3|ESP
Natan|CB|74|6|BRA|L
Héctor Bellerín|RB|75|2|ESP
Youssouf Sabaly|RB|73|23|SEN
Romain Perraud|LB|74|15|FRA|L
Ricardo Rodríguez|LB|74|12|SUI|L
Johnny Cardoso|CDM|76|4|USA
Marc Roca|CDM|76|21|ESP
Pablo Fornals|CM|78|18|ESP
Isco|CAM|81|22|ESP
Giovani Lo Celso|CAM|79|20|ARG|L
Abde Ezzalzouli|LW|78|10|MAR|R|90
Aitor Ruibal|RW|73|24|ESP
Chimy Ávila|ST|74|9|ARG
Vitor Roque|ST|73|8|BRA`,
  gir: `Paulo Gazzaniga|GK|78|13|ARG
Juan Carlos|GK|71|1|ESP
David López|CB|77|5|ESP
Ladislav Krejčí|CB|75|18|CZE
Daley Blind|CB|77|17|NED|L
Arnau Martínez|RB|75|4|ESP
Miguel Gutiérrez|LB|79|3|ESP|L
Oriol Romeu|CDM|76|14|ESP
Yangel Herrera|CM|77|21|VEN
Iván Martín|CM|76|23|ESP
Donny van de Beek|CM|74|6|NED
Viktor Tsygankov|RW|79|8|UKR|L
Bryan Gil|LW|74|22|ESP|L
Yáser Asprilla|RW|74|10|COL|L
Arnaut Danjuma|LW|75|11|NED
Abel Ruiz|ST|74|9|ESP
Cristhian Stuani|ST|74|7|URU
Bojan Miovski|ST|72|19|MKD`,
  osa: `Sergio Herrera|GK|78|1|ESP
Aitor Fernández|GK|72|13|ESP
Alejandro Catena|CB|76|24|ESP
Jorge Herrando|CB|71|5|ESP
Enzo Boyomo|CB|72|22|CMR
Jesús Areso|RB|74|12|ESP
Juan Cruz|LB|72|3|ESP|L
Abel Bretones|LB|71|23|ESP|L
Lucas Torró|CDM|75|6|ESP
Jon Moncayola|CM|76|7|ESP
Pablo Ibáñez|CM|72|19|ESP
Aimar Oroz|CAM|76|10|ESP
Rubén García|LW|75|14|ESP|L
Moi Gómez|LM|75|16|ESP
Bryan Zaragoza|LW|75|21|ESP|R|90
Kike Barja|RW|71|11|ESP
Ante Budimir|ST|78|17|CRO
Raúl García de Haro|ST|70|9|ESP`,
  clt: `Vicente Guaita|GK|75|13|ESP
Iván Villar|GK|71|1|ESP
Carl Starfelt|CB|75|2|SWE
Carlos Domínguez|CB|72|24|ESP
Marcos Alonso|CB|74|20|ESP|L
Óscar Mingueza|RB|76|3|ESP
Javi Rodríguez|CB|70|32|ESP
Hugo Álvarez|LB|69|30|ESP
Ilaix Moriba|CM|74|6|GUI
Fran Beltrán|CM|74|8|ESP
Damián Rodríguez|CDM|70|22|ESP
Hugo Sotelo|CM|69|17|ESP
Williot Swedberg|CAM|72|19|SWE
Franco Cervi|LW|72|11|ARG|L
Iago Aspas|ST|80|10|ESP|L
Borja Iglesias|ST|75|7|ESP
Jonathan Bamba|LW|74|14|CIV
Anastasios Douvikas|ST|72|9|GRE`,
  mll: `Dominik Greif|GK|74|1|SVK
Leo Román|GK|71|13|ESP
Antonio Raíllo|CB|76|21|ESP
Martin Valjent|CB|76|24|SVK
Siebe Van der Heyden|CB|71|5|BEL
Pablo Maffeo|RB|76|23|ARG
Mojica|LB|72|22|COL|L
Toni Lato|LB|71|3|ESP|L
Samú Costa|CDM|75|12|POR
Omar Mascarell|CDM|72|20|ESP
Manu Morlanes|CM|74|8|ESP
Sergi Darder|CAM|76|10|ESP
Dani Rodríguez|LM|74|14|ESP
Takuma Asano|RW|72|11|JPN
Cyle Larin|ST|73|17|CAN
Vedat Muriqi|ST|76|7|KOS
Abdón Prats|ST|71|9|ESP`,
  int: `Yann Sommer|GK|86|1|SUI
Josep Martínez|GK|74|13|ESP
Alessandro Bastoni|CB|87|95|ITA|L
Francesco Acerbi|CB|83|15|ITA|L
Benjamin Pavard|CB|83|28|FRA
Stefan de Vrij|CB|81|6|NED
Yann Bisseck|CB|76|31|GER
Denzel Dumfries|RWB|82|2|NED
Federico Dimarco|LWB|84|32|ITA|L
Carlos Augusto|LWB|77|30|BRA|L
Matteo Darmian|RWB|77|36|ITA
Hakan Çalhanoğlu|CDM|86|20|TUR
Nicolò Barella|CM|87|23|ITA
Henrikh Mkhitaryan|CM|81|22|ARM
Davide Frattesi|CM|80|16|ITA
Piotr Zieliński|CM|80|7|POL
Lautaro Martínez|ST|89|10|ARG
Marcus Thuram|ST|84|9|FRA
Mehdi Taremi|ST|79|99|IRN
Marko Arnautović|ST|75|8|AUT`,
  acm: `Mike Maignan|GK|87|16|FRA
Marco Sportiello|GK|71|57|ITA
Fikayo Tomori|CB|81|23|ENG
Malick Thiaw|CB|79|28|GER
Strahinja Pavlović|CB|76|31|SRB|L
Matteo Gabbia|CB|76|46|ITA
Emerson Royal|RB|76|22|BRA
Davide Calabria|RB|77|2|ITA
Theo Hernández|LB|86|19|FRA|L|93
Youssouf Fofana|CDM|79|29|FRA
Ismaël Bennacer|CDM|79|4|ALG|L
Tijjani Reijnders|CM|82|14|NED
Ruben Loftus-Cheek|CM|79|8|ENG
Yunus Musah|CM|74|80|USA
Christian Pulisic|RW|83|11|USA
Rafael Leão|LW|86|10|POR|R|94
Samuel Chukwueze|RW|76|21|NGA|L
Álvaro Morata|ST|81|7|ESP
Tammy Abraham|ST|76|90|ENG
Noah Okafor|ST|74|17|SUI`,
  juv: `Michele Di Gregorio|GK|82|29|ITA
Mattia Perin|GK|78|1|ITA
Gleison Bremer|CB|86|3|BRA
Federico Gatti|CB|79|4|ITA
Pierre Kalulu|CB|78|15|FRA
Danilo|CB|78|6|BRA
Andrea Cambiaso|LB|79|27|ITA|L
Juan Cabal|LB|73|32|COL|L
Nicolò Savona|RB|69|37|ITA
Manuel Locatelli|CDM|81|5|ITA
Khéphren Thuram|CM|80|19|FRA
Douglas Luiz|CM|80|26|BRA
Weston McKennie|CM|77|16|USA
Teun Koopmeiners|CAM|83|8|NED|L
Kenan Yıldız|LW|77|10|TUR
Nicolás González|RW|80|11|ARG|L
Francisco Conceição|RW|77|7|POR|L
Timothy Weah|RW|74|22|USA
Dušan Vlahović|ST|83|9|SRB|L
Arkadiusz Milik|ST|74|14|POL|L`,
  nap: `Alex Meret|GK|81|1|ITA|L
Elia Caprile|GK|72|25|ITA
Alessandro Buongiorno|CB|81|4|ITA|L
Amir Rrahmani|CB|81|13|KOS
Juan Jesus|CB|74|5|BRA|L
Giovanni Di Lorenzo|RB|83|22|ITA
Mathías Olivera|LB|78|17|URU|L
Leonardo Spinazzola|LB|76|37|ITA
Stanislav Lobotka|CDM|84|68|SVK
André-Frank Zambo Anguissa|CM|82|99|CMR
Scott McTominay|CM|80|8|SCO
Billy Gilmour|CM|75|6|SCO
Khvicha Kvaratskhelia|LW|86|77|GEO|R|88
Matteo Politano|RW|80|21|ITA|L
David Neres|RW|78|7|BRA|L|90
Giacomo Raspadori|CF|77|81|ITA
Romelu Lukaku|ST|83|11|BEL|L
Giovanni Simeone|ST|73|18|ARG`,
  rom: `Mile Svilar|GK|81|99|SRB|L
Mathew Ryan|GK|74|89|AUS
Gianluca Mancini|CB|80|23|ITA
Evan Ndicka|CB|79|5|CIV|L
Mats Hummels|CB|79|15|GER
Mario Hermoso|CB|76|22|ESP|L
Zeki Çelik|RB|75|19|TUR
Alexis Saelemaekers|RM|76|56|BEL
Angeliño|LB|77|3|ESP|L
Bryan Cristante|CDM|78|4|ITA
Leandro Paredes|CDM|78|16|ARG
Manu Koné|CM|78|17|FRA
Lorenzo Pellegrini|CAM|80|7|ITA
Paulo Dybala|CF|84|21|ARG|L
Stephan El Shaarawy|LW|76|92|ITA
Matías Soulé|RW|75|18|ARG|L
Artem Dovbyk|ST|81|11|UKR|L
Tommaso Baldanzi|CAM|72|35|ITA`,
  laz: `Ivan Provedel|GK|81|94|ITA
Christos Mandas|GK|73|35|GRE
Alessio Romagnoli|CB|80|13|ITA|L
Mario Gila|CB|77|34|ESP
Patric|CB|74|4|ESP
Adam Marušić|RB|77|77|MNE
Nuno Tavares|LB|76|30|POR|L
Manuel Lazzari|RB|74|29|ITA
Nicolò Rovella|CDM|77|6|ITA
Matteo Guendouzi|CM|79|8|FRA
Mattia Zaccagni|LW|80|10|ITA
Tijjani Noslin|CF|73|14|NED
Gustav Isaksen|RW|76|18|DEN|L
Pedro|RW|77|9|ESP
Boulaye Dia|ST|76|19|SEN
Valentín Castellanos|ST|77|11|ARG
Fisayo Dele-Bashiru|CM|72|7|NGA
Matías Vecino|CM|73|5|URU`,
  ata: `Marco Carnesecchi|GK|80|29|ITA
Rui Patrício|GK|76|28|POR
Isak Hien|CB|77|4|SWE
Berat Djimsiti|CB|77|19|ALB
Sead Kolašinac|CB|75|23|BIH|L
Ben Godfrey|CB|73|5|ENG
Marten de Roon|CDM|79|15|NED
Éderson|CM|81|13|BRA
Davide Zappacosta|RWB|76|77|ITA
Matteo Ruggeri|LWB|75|22|ITA|L
Raoul Bellanova|RWB|75|16|ITA
Mario Pašalić|CAM|79|8|CRO
Charles De Ketelaere|CAM|80|17|BEL|L
Lazar Samardžić|CAM|76|24|SRB|L
Ademola Lookman|LW|84|11|NGA|R|88
Mateo Retegui|ST|80|32|ITA
Gianluca Scamacca|ST|78|90|ITA
Nicolò Zaniolo|RW|74|10|ITA|L`,
  fio: `David de Gea|GK|80|43|ESP
Pietro Terracciano|GK|72|1|ITA
Luca Ranieri|CB|74|6|ITA|L
Pietro Comuzzo|CB|71|15|ITA
Marin Pongračić|CB|74|5|CRO
Dodô|RB|78|2|BRA
Robin Gosens|LB|77|21|GER|L
Fabiano Parisi|LB|72|65|ITA|L
Danilo Cataldi|CDM|75|32|ITA
Edoardo Bove|CM|74|4|ITA
Rolando Mandragora|CM|74|8|ITA|L
Yacine Adli|CM|73|29|FRA
Albert Guðmundsson|CAM|78|10|ISL
Andrea Colpani|CAM|74|23|ITA|L
Riccardo Sottil|LW|72|7|ITA
Lucas Beltrán|ST|74|9|ARG
Moise Kean|ST|78|20|ITA
Michael Kayode|RB|70|33|ITA`,
  bol: `Łukasz Skorupski|GK|78|28|POL
Federico Ravaglia|GK|69|34|ITA
Sam Beukema|CB|78|31|NED
Jhon Lucumí|CB|77|26|COL|L
Stefan Posch|RB|75|3|AUT
Emil Holm|RB|74|2|SWE
Juan Miranda|LB|74|33|ESP|L
Charalampos Lykogiannis|LB|72|22|GRE|L
Remo Freuler|CDM|78|8|SUI
Michel Aebischer|CM|75|20|SUI
Nikola Moro|CM|73|6|CRO
Giovanni Fabbian|CM|72|80|ITA
Riccardo Orsolini|RW|79|7|ITA|L
Dan Ndoye|LW|76|11|SUI
Jens Odgaard|CAM|74|21|DEN
Santiago Castro|ST|73|9|ARG
Thijs Dallinga|ST|73|24|NED
Benjamín Domínguez|LW|70|30|ARG|L`,
  tor: `Vanja Milinković-Savić|GK|78|32|SRB
Alberto Paleari|GK|68|89|ITA
Saúl Coco|CB|74|23|EQG
Guillermo Maripán|CB|74|13|CHI
Adam Masina|CB|71|5|MAR|L
Sebastian Walukiewicz|CB|72|4|POL
Valentino Lazaro|RWB|74|20|AUT
Borna Sosa|LWB|73|34|CRO|L
Samuele Ricci|CDM|78|28|ITA
Ivan Ilić|CM|76|8|SRB|L
Karol Linetty|CM|73|77|POL
Gvidas Gineitis|CM|69|66|LTU
Nikola Vlašić|CAM|76|10|CRO
Yann Karamoh|RW|70|7|FRA
Duván Zapata|ST|78|91|COL
Antonio Sanabria|ST|74|9|PAR
Che Adams|ST|74|18|SCO`,
  udi: `Maduka Okoye|GK|74|40|NGA
Răzvan Sava|GK|72|90|ROU
Jaka Bijol|CB|77|29|SVN
Thomas Kristensen|CB|73|31|DEN
Christian Kabasele|CB|71|27|BEL
Oumar Solet|CB|73|28|FRA
Kingsley Ehizibue|RWB|72|19|NGA
Hassane Kamara|LWB|73|11|CIV|L
Jordan Zemura|LWB|71|33|ZIM|L
Jesper Karlström|CDM|74|25|SWE
Sandi Lovrić|CM|74|8|SVN
Jurgen Ekkelenkamp|CM|73|32|NED
Martín Payero|CM|73|5|ARG
Arthur Atta|CM|70|14|FRA
Florian Thauvin|RW|77|10|FRA|L
Iker Bravo|ST|69|20|ESP
Lorenzo Lucca|ST|74|17|ITA
Keinan Davis|ST|71|9|ENG`,
  gen: `Nicola Leali|GK|71|1|ITA
Pierluigi Gollini|GK|72|95|ITA
Johan Vásquez|CB|76|22|MEX|L
Koni De Winter|CB|74|4|BEL
Mattia Bani|CB|73|13|ITA
Alessandro Vogliacco|CB|71|14|ITA
Stefano Sabelli|RWB|71|20|ITA
Aarón Martín|LWB|74|3|ESP|L
Milan Badelj|CDM|73|47|CRO
Morten Frendrup|CM|76|32|DEN
Fabio Miretti|CM|72|23|ITA
Morten Thorsby|CM|72|2|NOR
Ruslan Malinovskyi|CAM|74|17|UKR|L
Junior Messias|RW|73|10|BRA|L
Vitinha|LW|72|9|POR
Andrea Pinamonti|ST|74|19|ITA
Caleb Ekuban|ST|70|18|GHA
Alessandro Zanoli|RB|69|59|ITA`,
};

export default rosters;
