// Modern Football (2024-25): rest of Europe. Format: see modern-eng.ts.
// Squads outside the big five leagues are lower-confidence; edit in-game.
import type { RosterSource } from '../../../types/db.ts';

const rosters: RosterSource = {
  slb: `Anatoliy Trubin|GK|80|1|UKR
Samuel Soares|GK|69|24|POR
António Silva|CB|78|4|POR
Nicolás Otamendi|CB|79|30|ARG
Tomás Araújo|CB|76|44|POR
Alexander Bah|RB|74|6|DEN
Issa Kaboré|RB|71|20|BFA
Álvaro Carreras|LB|76|3|ESP|L
Florentino Luís|CDM|77|61|POR
Fredrik Aursnes|CM|78|8|NOR|L
Orkun Kökçü|CM|80|10|TUR
Leandro Barreiro|CM|74|18|LUX
Kerem Aktürkoğlu|LW|78|17|TUR
Ángel Di María|RW|80|11|ARG|L
Zeki Amdouni|ST|74|7|SUI
Vangelis Pavlidis|ST|78|14|GRE
Arthur Cabral|ST|73|9|BRA
Andreas Schjelderup|LW|72|21|NOR`,
  fcp: `Diogo Costa|GK|84|99|POR
Cláudio Ramos|GK|71|14|POR
Nehuén Pérez|CB|75|24|ARG
Otávio Ataíde|CB|73|4|BRA
Zé Pedro|CB|71|97|POR
Tiago Djaló|CB|73|3|POR
João Mário Lopes|RB|76|23|POR
Martim Fernandes|RB|72|52|POR
Francisco Moura|LB|72|74|POR|L
Alan Varela|CDM|77|22|ARG
Stephen Eustáquio|CM|77|6|CAN
Fábio Vieira|CAM|76|10|POR|L
Nico González|CM|74|16|ESP
Pepê|RW|77|11|BRA
Galeno|LW|78|13|BRA
Gonçalo Borges|RW|71|70|POR|L
Samu Omorodion|ST|76|9|ESP
Deniz Gül|ST|69|27|SWE`,
  scp: `Franco Israel|GK|74|1|URU
Vladan Kovačević|GK|73|12|BIH
Ousmane Diomande|CB|79|26|CIV
Gonçalo Inácio|CB|80|25|POR|L
Zeno Debast|CB|74|6|BEL
Eduardo Quaresma|CB|73|72|POR
Geny Catamo|RWB|74|10|MOZ|L
Ivan Fresneda|RWB|71|22|ESP
Maximiliano Araújo|LWB|75|20|URU|L
Matheus Reis|LWB|72|2|BRA|L
Morten Hjulmand|CDM|80|42|DEN
Hidemasa Morita|CM|77|5|JPN
Daniel Bragança|CM|74|23|POR|L
Pedro Gonçalves|CAM|79|8|POR
Trincão|RW|78|17|POR|L
Marcus Edwards|LW|74|3|ENG|L
Viktor Gyökeres|ST|84|9|SWE
Conrad Harder|ST|71|19|DEN`,
  scb: `Matheus|GK|75|1|BRA
Lukáš Horníček|GK|68|12|CZE
Paulo Oliveira|CB|72|15|POR
Robson Bambu|CB|71|3|BRA
Sikou Niakaté|CB|71|4|MLI|L
Víctor Gómez|RB|71|2|ESP
Adrián Marín|LB|71|5|ESP|L
Vítor Carvalho|CDM|71|6|BRA
João Moutinho|CM|72|8|POR
João Marques|CM|69|20|POR
Rodrigo Zalazar|CAM|76|10|URU
Ricardo Horta|LW|77|21|POR
Bruma|RW|72|7|POR
Gabri Martínez|RW|69|11|ESP
Roger Fernandes|LW|71|17|GNB
Amine El Ouazzani|ST|71|9|MAR
Roberto Fernández Jaén|ST|70|90|ESP
Bright Arrey-Mbi|CB|68|26|ENG`,
  aja: `Remko Pasveer|GK|74|22|NED
Jay Gorter|GK|69|1|NED
Josip Šutalo|CB|78|37|CRO
Jorrel Hato|CB|75|4|NED|L
Youri Baas|CB|72|15|NED|L
Daniele Rugani|CB|72|3|ITA
Anton Gaaei|RB|72|7|DEN
Devyne Rensch|RB|73|2|NED
Owen Wijndal|LB|71|5|NED|L
Jordan Henderson|CM|77|6|ENG
Kenneth Taylor|CM|74|8|NED
Branco van den Boomen|CM|72|18|NED
Kian Fitz-Jim|CM|69|28|NED
Steven Berghuis|RW|75|23|NED|L
Mika Godts|LW|72|11|BEL
Bertrand Traoré|LW|72|10|BFA
Brian Brobbey|ST|78|9|NED
Wout Weghorst|ST|76|25|NED`,
  psv: `Walter Benítez|GK|78|1|ARG
Joël Drommel|GK|70|16|NED
Olivier Boscagli|CB|76|18|FRA|L
Ryan Flamingo|CB|74|6|NED
Jerdy Schouten|CDM|80|22|NED
Rick Karsdorp|RB|71|2|NED
Mauro Júnior|LB|72|17|BRA|L
Richard Ledezma|RB|70|19|USA
Joey Veerman|CM|79|23|NED
Malik Tillman|CAM|77|10|USA
Guus Til|CAM|75|20|NED
Ismael Saibari|CAM|74|34|MAR
Noa Lang|LW|77|7|NED
Johan Bakayoko|RW|76|11|BEL|L
Ivan Perišić|LW|78|5|CRO
Luuk de Jong|ST|77|9|NED
Ricardo Pepi|ST|74|14|USA
Couhaib Driouech|RW|71|27|NED`,
  fey: `Timon Wellenreuther|GK|74|22|GER
Justin Bijlow|GK|75|1|NED
David Hancko|CB|79|33|SVK|L
Gernot Trauner|CB|74|18|AUT
Thomas Beelen|CB|70|3|NED
Gijs Smal|LB|70|5|NED|L
Bart Nieuwkoop|RB|70|2|NED
Hugo Bueno|LB|69|15|ESP|L
Hwang In-beom|CM|76|4|KOR
Quinten Timber|CM|76|8|NED
Antoni Milambo|CM|71|27|NED
Calvin Stengs|CAM|74|10|NED|L
Igor Paixão|LW|75|14|BRA
Anis Hadj Moussa|RW|72|23|ALG
Ibrahim Osman|LW|70|7|GHA
Ayase Ueda|ST|74|9|JPN
Santiago Giménez|ST|78|29|MEX
Julián Carranza|ST|71|19|ARG`,
  az: `Rome-Jayden Owusu-Oduro|GK|71|1|NED
Hobie Verhulst|GK|69|12|NED
Wouter Goes|CB|71|3|NED
Alexandre Penetra|CB|71|4|POR
Bruno Martins Indi|CB|70|5|NED|L
Seiya Maikuma|RB|70|2|JPN
Mees de Wit|LB|68|31|NED|L
Jordy Clasie|CDM|71|6|NED
Sven Mijnans|CM|72|10|NED
Peer Koopmeiners|CM|69|8|NED
Kees Smit|CM|67|26|NED
Ruben van Bommel|LW|70|11|NED
Ernest Poku|RW|69|7|NED
Mexx Meerdink|ST|69|19|NED
Troy Parrott|ST|71|9|IRL
Denso Kasius|RB|69|17|NED
Ibrahim Sadiq|LW|68|20|GHA
Maxim Dekker|CB|66|23|NED`,
  cel: `Kasper Schmeichel|GK|80|1|DEN
Viljami Sinisalo|GK|67|12|FIN
Cameron Carter-Vickers|CB|76|20|USA
Liam Scales|CB|71|5|IRL|L
Auston Trusty|CB|72|6|USA|L
Alistair Johnston|RB|75|2|CAN
Greg Taylor|LB|71|3|SCO|L
Callum McGregor|CDM|78|42|SCO
Arne Engels|CM|74|27|BEL
Reo Hatate|CM|75|41|JPN
Paulo Bernardo|CM|72|28|POR
Luke McCowan|CAM|70|14|SCO
Daizen Maeda|LW|74|38|JPN|R|92
Nicolas Kühn|RW|76|10|GER|L
James Forrest|RW|70|49|SCO
Kyogo Furuhashi|ST|75|8|JPN
Adam Idah|ST|72|9|IRL
Yang Hyun-jun|RW|68|13|KOR`,
  ran: `Jack Butland|GK|76|1|ENG
Liam Kelly|GK|67|31|SCO
John Souttar|CB|71|16|SCO
Robin Pröpper|CB|71|4|NED
Leon Balogun|CB|69|27|NGA
James Tavernier|RB|74|2|ENG
Jefté|LB|70|22|BRA|L
Ridvan Yılmaz|LB|70|3|TUR|L
Mohamed Diomandé|CM|73|10|CIV
Connor Barron|CM|69|8|SCO
Nicolas Raskin|CM|72|43|BEL
Tom Lawrence|CAM|70|11|WAL
Vaclav Černý|RW|74|18|CZE|L
Hamza Igamane|ST|70|29|MAR
Cyriel Dessers|ST|72|9|NGA
Danilo Pereira da Silva|ST|71|99|BRA
Ross McCausland|RW|67|49|NIR
Ianis Hagi|CAM|70|7|ROU`,
  brg: `Simon Mignolet|GK|76|22|BEL
Nordin Jackers|GK|71|29|BEL
Brandon Mechele|CB|73|44|BEL
Joel Ordóñez|CB|71|4|ECU
Kyriani Sabbe|RB|69|64|BEL
Bjorn Meijer|LB|71|14|NED|L
Maxim De Cuyper|LB|74|55|BEL|L
Raphael Onyedika|CDM|74|15|NGA
Ardon Jashari|CM|74|30|SUI
Hans Vanaken|CAM|76|20|BEL
Hugo Vetlesen|CM|71|10|NOR
Christos Tzolis|LW|76|8|GRE
Andreas Skov Olsen|RW|76|7|DEN|L
Chemsdine Talbi|RW|69|68|MAR
Ferran Jutglà|ST|72|9|ESP
Gustaf Nilsson|ST|70|19|SWE
Casper Nielsen|CM|71|27|DEN
Michal Skóraś|RW|70|21|POL`,
  and: `Colin Coosemans|GK|73|26|BEL
Mads Kikkenborg|GK|68|1|DEN
Jan Vertonghen|CB|76|14|BEL|L
Zanka|CB|70|5|DEN
Lucas Hey|CB|68|3|DEN
Killian Sardella|RB|69|54|BEL
Ludwig Augustinsson|LB|69|2|SWE|L
Moussa N'Diaye|LB|68|22|SEN|L
Leander Dendoncker|CDM|72|32|BEL
Mario Stroeykens|CAM|70|10|BEL
Yari Verschaeren|CAM|70|4|BEL
Théo Leoni|CM|67|8|BEL
Anders Dreyer|RW|73|36|DEN|L
Francis Amuzu|LW|70|11|BEL
Luis Vázquez|ST|69|9|ARG
Kasper Dolberg|ST|73|12|DEN
Tristan Degreef|RW|66|7|BEL
Majeed Ashimeru|CM|67|20|GHA`,
  gal: `Fernando Muslera|GK|76|1|URU
Günay Güvenç|GK|69|19|TUR
Davinson Sánchez|CB|78|6|COL
Abdülkerim Bardakcı|CB|76|42|TUR|L
Victor Nelsson|CB|73|25|DEN
Kaan Ayhan|CB|75|23|TUR
Roland Sallai|RW|76|7|HUN
Ismail Jakobs|LB|73|18|SEN|L
Lucas Torreira|CDM|78|34|URU
Gabriel Sara|CM|76|8|BRA
Kerem Demirbay|CM|72|17|GER
Dries Mertens|CAM|76|10|BEL
Barış Alper Yılmaz|RW|77|53|TUR
Yunus Akgün|RW|72|11|TUR|L
Victor Osimhen|ST|86|45|NGA|R|88
Mauro Icardi|ST|78|9|ARG
Michy Batshuayi|ST|73|99|BEL|L
Elias Jelert|RB|70|2|DEN`,
  fen: `Dominik Livaković|GK|82|40|CRO
İrfan Can Eğribayat|GK|72|1|TUR
Alexander Djiku|CB|74|6|GHA
Çağlar Söyüncü|CB|74|4|TUR
Rodrigo Becão|CB|72|50|BRA
Bright Osayi-Samuel|RB|73|21|NGA
Mert Müldür|RB|74|16|TUR
Jayden Oosterwolde|LB|72|24|NED|L
Fred|CDM|78|35|BRA
Sofyan Amrabat|CDM|78|34|MAR
İsmail Yüksek|CDM|74|5|TUR
Sebastian Szymański|CAM|76|53|POL
Dušan Tadić|CAM|78|10|SRB|L
Allan Saint-Maximin|LW|76|97|FRA
İrfan Can Kahveci|RW|74|17|TUR|L
Edin Džeko|ST|77|9|BIH
Youssef En-Nesyri|ST|78|19|MAR`,
  bjk: `Mert Günok|GK|76|34|TUR
Ersin Destanoğlu|GK|69|30|TUR
Gabriel Paulista|CB|73|3|BRA
Felix Uduokhai|CB|72|14|GER
Emirhan Topçu|CB|68|53|TUR
Jonas Svensson|RB|71|2|NOR
Arthur Masuaku|LB|71|26|COD|L
Gedson Fernandes|CM|76|83|POR
Al-Musrati|CDM|74|6|LBY
Salih Uçan|CM|70|8|TUR
Rafa Silva|CAM|78|27|POR
Milot Rashica|LW|72|7|KOS
Ernest Muçi|LW|72|23|ALB
Ciro Immobile|ST|78|17|ITA
Semih Kılıçsoy|ST|71|90|TUR
João Mário|CM|74|10|POR
Joe Worrall|CB|70|18|ENG
Cher Ndour|CM|69|11|ITA`,
  oly: `Konstantinos Tzolakis|GK|73|88|GRE
Alexandros Paschalakis|GK|69|31|GRE
Panagiotis Retsos|CB|72|45|GRE
Lorenzo Pirola|CB|70|5|ITA|L
David Carmo|CB|72|16|POR|L
Rodinei|RB|72|23|BRA
Francisco Ortega|LB|70|3|ARG|L
Santiago Hezze|CDM|72|32|ARG
Chiquinho|CM|72|22|POR
Dani García|CDM|71|14|ESP
Gelson Martins|RW|74|10|POR
Kostas Fortounis|CAM|72|7|GRE
Roman Yaremchuk|ST|73|9|UKR
Ayoub El Kaabi|ST|75|11|MAR
Rodrigo Moreno|LW|70|19|ESP
Giulian Biancone|RB|69|4|FRA
Bruno Onyemaechi|LB|68|70|NGA|L
Sergio Oliveira|CM|71|27|POR`,
  pao: `Alban Lafont|GK|78|40|FRA
Bartłomiej Drągowski|GK|72|69|POL
Tin Jedvaj|CB|70|21|CRO
Erik Palmer-Brown|CB|70|5|USA
Georgios Kyriakopoulos|LB|70|77|GRE|L
Filip Mladenović|LB|72|25|SRB|L
Giannis Kotsiras|RB|69|27|GRE
Adam Gnezda Čerin|CM|72|8|SVN
Tonny Vilhena|CM|71|17|NED
Manolis Siopis|CDM|72|6|GRE
Facundo Pellistri|RW|74|11|URU
Anastasios Bakasetas|CAM|72|10|GRE|L
Tete|RW|73|7|BRA
Fotis Ioannidis|ST|74|9|GRE
Karol Świderski|ST|73|14|POL
Filip Đuričić|CAM|71|22|SRB
Sverrir Ingason|CB|69|15|ISL
Daniel Mancini|LW|69|23|ARG`,
  rbs: `Alexander Schlager|GK|74|1|AUT
Janis Blaswich|GK|74|21|GER
Samson Baidoo|CB|71|6|AUT
Hendry Blank|CB|68|5|GER
Amar Dedić|RB|74|70|BIH
Frans Krätzig|LB|70|3|GER|L
Stefan Lainer|RB|71|22|AUT
Mads Bidstrup|CM|71|18|DEN
Maurits Kjærgaard|CM|71|14|DEN
Lucas Gourna-Douath|CDM|71|27|FRA
Oscar Gloukh|CAM|74|30|ISR|L
Nicolás Capaldo|CM|71|7|ARG
Dorgeles Nene|LW|69|11|MLI
Moussa Yeo|RW|67|19|CIV
Karim Konaté|ST|71|9|CIV
Petar Ratkov|ST|68|2|SRB
Adam Daghim|LW|66|20|DEN`,
  yb: `David von Ballmoos|GK|72|26|SUI
Marvin Keller|GK|71|1|SUI
Mohamed Camara|CB|70|4|MLI
Loris Benito|CB|69|3|SUI|L
Patric Pfeffer|CB|67|5|GER
Saidy Janko|RB|68|2|GAM
Jaouen Hadjam|LB|69|19|ALG|L
Sandro Lauper|CDM|70|30|SUI
Cheikh Niasse|CDM|69|6|SEN
Filip Ugrinić|CM|69|7|SUI
Darian Males|CAM|67|10|SUI
Joël Monteiro|LW|70|77|POR
Meschack Elia|RW|69|15|COD
Ebrima Colley|LW|67|11|GAM
Cedric Itten|ST|70|9|SUI
Silvère Ganvoula|ST|69|35|CGO
Kastriot Imeri|CAM|68|17|SUI
Lewin Blum|RB|66|16|SUI`,
  shk: `Dmytro Riznyk|GK|73|31|UKR
Kiril Fesyun|GK|64|1|UKR
Mykola Matviyenko|CB|76|22|UKR|L
Valeriy Bondar|CB|71|5|UKR
Marlon Gomes|CM|71|8|BRA
Yukhym Konoplya|RB|72|26|UKR
Pedrinho|LB|69|38|BRA|L
Irakli Azarovi|LB|68|13|GEO|L
Artem Bondarenko|CM|71|21|UKR
Oleh Ocheretko|CM|68|27|UKR
Heorhiy Sudakov|CAM|76|10|UKR
Eguinaldo|LW|70|7|BRA
Kevin|LW|71|11|BRA
Danylo Sikan|ST|69|14|UKR
Lassina Traoré|ST|69|2|BFA
Newerton|RW|68|19|BRA
Dmytro Kryskiv|CM|66|6|UKR
Marian Shved|RW|67|17|UKR`,
  din: `Ivan Nevistić|GK|72|33|CRO
Danijel Zagorac|GK|65|1|CRO
Kevin Théophile-Catherine|CB|70|28|FRA
Raúl Torrente|CB|69|6|ESP
Maxime Bernauer|CB|68|5|FRA
Stefan Ristovski|RB|68|13|MKD
Ronaël Pierre-Gabriel|RB|68|2|FRA
Bruno Goda|LB|67|22|CRO|L
Arijan Ademi|CDM|68|3|MKD
Josip Mišić|CM|70|27|CRO
Martin Baturina|CAM|74|10|CRO
Petar Sučić|CM|72|25|CRO
Marko Pjaca|LW|70|17|CRO
Gabriel Vidović|RW|70|23|CRO
Sandro Kulenović|ST|69|9|CRO
Juan Córdoba|LW|66|7|COL
Marko Rog|CM|69|30|CRO
Dario Špikić|RW|67|11|CRO`,
  crv: `Ivan Guteša|GK|68|18|SRB
Omri Glazer|GK|71|1|ISR
Uroš Spajić|CB|68|5|SRB
Nasser Djiga|CB|69|24|BFA
Rodrigão|CB|68|6|BRA
Seol Young-woo|RB|70|66|KOR
Milan Rodić|LB|67|23|SRB|L
Mirko Ivanić|CAM|72|4|MNE
Rade Krunić|CM|71|33|BIH
Timi Max Elšnik|CM|70|21|SVN
Guélor Kanga|CM|70|8|GAB
Felício Milson|RW|68|11|ANG
Bruno Duarte|ST|68|9|BRA
Cherif Ndiaye|ST|69|19|SEN
Peter Olayinka|LW|67|7|NGA
Silas|RW|71|17|COD
Aleksandar Katai|LW|69|10|SRB
Jovan Mijatović|ST|63|79|SRB`,
};

export default rosters;
